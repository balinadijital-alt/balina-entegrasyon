<?php

namespace Tests\Feature;

use App\Jobs\Imports\ProcessProductImportJob;
use App\Jobs\Shipping\ProcessShipmentJob;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentProvider;
use App\Models\ProductImportRun;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\User;
use App\Services\Marketplaces\TrendyolService;
use App\Services\Payments\Providers\OfflinePaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class ProviderWriteAuditLoggingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['super_admin', 'company_admin', 'operator', 'finance', 'warehouse', 'support'] as $role) {
            Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
        }
    }

    public function test_marketplace_send_writes_audit_log(): void
    {
        Queue::fake();

        $company = $this->company();
        $marketplace = $this->marketplace($company);
        $operator = $this->user($company, 'operator');

        $this->actingAs($operator)->postJson("/api/marketplaces/{$marketplace->id}/trendyol/send-products")
            ->assertAccepted()
            ->assertJsonPath('queued', true);

        Queue::assertPushed(SendProductsToTrendyolJob::class);
        $this->assertAudit('marketplace', 'products.send', $company, $operator, [
            'marketplace_code' => 'trendyol',
            'marketplace_account_id' => $marketplace->id,
            'queued' => true,
        ]);
    }

    public function test_marketplace_archive_writes_audit_log_without_calling_real_provider(): void
    {
        $company = $this->company();
        $marketplace = $this->marketplace($company);
        $operator = $this->user($company, 'operator');

        $this->mock(TrendyolService::class, function ($mock) {
            $mock->shouldReceive('archiveProducts')->once()->andReturn(['batchRequestId' => 'batch-1']);
        });

        $this->actingAs($operator)->putJson("/api/marketplaces/{$marketplace->id}/trendyol/products/archive", [
            'barcodes' => ['868000000001'],
            'archive' => true,
        ])->assertOk();

        $this->assertAudit('marketplace', 'products.archive', $company, $operator, [
            'marketplace_code' => 'trendyol',
            'marketplace_account_id' => $marketplace->id,
            'barcodes_count' => 1,
            'archive' => true,
        ]);
    }

    public function test_refund_writes_audit_log(): void
    {
        $company = $this->company();
        $payment = $this->payment($company);
        $finance = $this->user($company, 'finance');

        $this->actingAs($finance)->postJson("/api/payments/{$payment->id}/refund", ['amount' => 15])
            ->assertOk()
            ->assertJsonPath('refunded_amount', '15.00');

        $this->assertAudit('payment', 'payment.refund', $company, $finance, [
            'payment_id' => $payment->id,
            'provider_code' => 'offline',
            'amount' => 15,
            'old_refunded_amount' => 0,
            'new_refunded_amount' => 15,
        ]);
    }

    public function test_shipment_retry_writes_audit_log(): void
    {
        Queue::fake();

        $company = $this->company();
        $shipment = $this->shipment($company);
        $warehouse = $this->user($company, 'warehouse');

        $this->actingAs($warehouse)->postJson("/api/shipments/{$shipment->id}/retry")
            ->assertAccepted()
            ->assertJsonPath('queued', true);

        Queue::assertPushed(ProcessShipmentJob::class);
        $this->assertAudit('shipping', 'shipment.retry', $company, $warehouse, [
            'shipment_id' => $shipment->id,
            'order_id' => $shipment->order_id,
            'carrier_code' => 'aras',
            'queued' => true,
        ]);
    }

    public function test_queue_retry_writes_audit_log_for_super_admin(): void
    {
        $admin = $this->user(null, 'super_admin');

        Artisan::shouldReceive('call')->once()->with('queue:retry', ['id' => ['failed-uuid']])->andReturn(0);

        $this->actingAs($admin)->postJson('/api/queue/failed/failed-uuid/retry')
            ->assertOk();

        $audit = AuditLog::query()->where('module', 'queue')->where('action', 'queue.failed.retry')->firstOrFail();
        $this->assertSame($admin->id, $audit->user_id);
        $this->assertNull($audit->company_id);
        $this->assertSame('failed-uuid', data_get($audit->new_values, 'context.uuid'));
        $this->assertSame('global', data_get($audit->new_values, 'context.tenant_scope'));
    }

    public function test_import_retry_writes_audit_log(): void
    {
        Queue::fake();

        $company = $this->company();
        $run = ProductImportRun::create([
            'company_id' => $company->id,
            'source_type' => 'xml',
            'field_mapping' => [],
            'status' => 'failed',
            'processed_rows' => 12,
            'error_count' => 2,
        ]);
        $operator = $this->user($company, 'operator');

        $this->actingAs($operator)->postJson("/api/import-runs/{$run->id}/retry")
            ->assertAccepted()
            ->assertJsonPath('queued', true);

        Queue::assertPushed(ProcessProductImportJob::class);
        $this->assertAudit('import', 'product_import.retry', $company, $operator, [
            'import_run_id' => $run->id,
            'source_type' => 'xml',
            'queued' => true,
        ]);
    }

    public function test_forbidden_write_action_does_not_create_audit_log(): void
    {
        $company = $this->company();
        $payment = $this->payment($company);
        $support = $this->user($company, 'support');

        $this->actingAs($support)->postJson("/api/payments/{$payment->id}/refund", ['amount' => 5])
            ->assertForbidden();

        $this->assertDatabaseCount('audit_logs', 0);
    }

    private function assertAudit(string $module, string $action, Company $company, User $actor, array $context): void
    {
        $audit = AuditLog::query()
            ->where('module', $module)
            ->where('action', $action)
            ->latest()
            ->firstOrFail();

        $this->assertSame($company->id, $audit->company_id);
        $this->assertSame($actor->id, $audit->user_id);

        foreach ($context as $key => $value) {
            $this->assertSame($value, data_get($audit->new_values, "context.{$key}"));
        }
    }

    private function user(?Company $company, string $role): User
    {
        $user = User::factory()->create(['company_id' => $company?->id]);
        $user->assignRole($role);

        return $user;
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Company '.Str::random(8),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function marketplace(Company $company): MarketplaceAccount
    {
        return MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => 'supplier-'.$company->id,
            'api_key' => 'key',
            'api_secret' => 'secret',
            'is_active' => true,
        ]);
    }

    private function order(Company $company): Order
    {
        return Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'manual',
            'marketplace_order_id' => (string) Str::uuid(),
            'customer_name' => 'Customer',
            'total_amount' => 100,
            'status' => 'new',
        ]);
    }

    private function payment(Company $company): Payment
    {
        $provider = PaymentProvider::firstOrCreate(
            ['code' => 'offline'],
            ['name' => 'Offline', 'service_class' => OfflinePaymentService::class, 'capabilities' => [], 'is_active' => true]
        );
        $provider->forceFill(['service_class' => OfflinePaymentService::class])->save();
        $account = PaymentAccount::create([
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Offline POS',
            'settings' => ['endpoints' => []],
            'is_active' => true,
        ]);

        return Payment::create([
            'order_id' => $this->order($company)->id,
            'payment_account_id' => $account->id,
            'provider_code' => 'offline',
            'method' => 'card',
            'status' => 'paid',
            'amount' => 100,
            'refunded_amount' => 0,
        ]);
    }

    private function shipment(Company $company): Shipment
    {
        $carrier = ShippingCarrier::firstOrCreate(
            ['code' => 'aras'],
            ['name' => 'Aras', 'service_class' => 'FakeCargoService', 'capabilities' => [], 'is_active' => true]
        );
        $account = ShippingAccount::create([
            'company_id' => $company->id,
            'shipping_carrier_id' => $carrier->id,
            'name' => 'Aras Account',
            'settings' => ['endpoints' => []],
            'is_active' => true,
        ]);

        return Shipment::create([
            'order_id' => $this->order($company)->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => 'aras',
            'status' => 'failed',
            'last_action' => 'label',
        ]);
    }
}
