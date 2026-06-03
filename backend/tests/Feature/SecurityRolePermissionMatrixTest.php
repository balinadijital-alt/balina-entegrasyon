<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentProvider;
use App\Models\SaasPlan;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\User;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SecurityRolePermissionMatrixTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['super_admin', 'company_admin', 'operator', 'finance', 'warehouse', 'support'] as $role) {
            Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
        }
    }

    public function test_support_cannot_refund_but_finance_can(): void
    {
        $company = $this->company();
        $payment = $this->paymentForCompany($company);

        $support = $this->user($company, 'support');
        $this->actingAs($support)->postJson("/api/payments/{$payment->id}/refund", ['amount' => 5])
            ->assertForbidden();

        $finance = $this->user($company, 'finance');
        $this->actingAs($finance)->postJson("/api/payments/{$payment->id}/refund", ['amount' => 5])
            ->assertOk()
            ->assertJsonPath('refunded_amount', '5.00');
    }

    public function test_warehouse_can_create_shipment_label_but_cannot_refund(): void
    {
        Queue::fake();

        $company = $this->company();
        $shipment = $this->shipmentForCompany($company);
        $payment = $this->paymentForCompany($company);
        $warehouse = $this->user($company, 'warehouse');

        $this->actingAs($warehouse)->postJson("/api/shipments/{$shipment->id}/label")
            ->assertAccepted()
            ->assertJsonPath('queued', true);

        $this->actingAs($warehouse)->postJson("/api/payments/{$payment->id}/refund", ['amount' => 5])
            ->assertForbidden();
    }

    public function test_operator_can_send_provider_products_but_cannot_manage_saas(): void
    {
        Queue::fake();

        $company = $this->company();
        $marketplace = MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => 'supplier-1',
            'api_key' => 'key',
            'api_secret' => 'secret',
            'is_active' => true,
        ]);
        $operator = $this->user($company, 'operator');
        $plan = SaasPlan::query()->firstOrFail();

        $this->actingAs($operator)->postJson("/api/marketplaces/{$marketplace->id}/trendyol/send-products")
            ->assertAccepted()
            ->assertJsonPath('queued', true);

        Queue::assertPushed(SendProductsToTrendyolJob::class);

        $this->actingAs($operator)->postJson("/api/companies/{$company->id}/start-trial", ['saas_plan_id' => $plan->id])
            ->assertForbidden();
    }

    public function test_company_admin_can_manage_settings(): void
    {
        $company = $this->company();
        $admin = $this->user($company, 'company_admin');

        $this->actingAs($admin)->putJson('/api/settings', [
            'notifications' => ['panel_enabled' => true],
        ])->assertOk();
    }

    public function test_tenant_user_cannot_assign_super_admin_or_cross_company_roles(): void
    {
        $company = $this->company();
        $otherCompany = $this->company();
        $admin = $this->user($company, 'company_admin');
        $ownUser = $this->user($company, 'support');
        $otherUser = $this->user($otherCompany, 'support');

        $this->actingAs($admin)->postJson("/api/users/{$ownUser->id}/roles", ['roles' => ['super_admin']])
            ->assertForbidden();

        $this->actingAs($admin)->postJson("/api/users/{$otherUser->id}/roles", ['roles' => ['support']])
            ->assertForbidden();
    }

    public function test_super_admin_can_manage_saas(): void
    {
        $company = $this->company();
        $superAdmin = $this->user(null, 'super_admin');
        $plan = SaasPlan::query()->firstOrFail();

        $this->actingAs($superAdmin)->postJson("/api/companies/{$company->id}/start-trial", ['saas_plan_id' => $plan->id])
            ->assertCreated()
            ->assertJsonPath('company_id', $company->id);
    }

    public function test_queue_retry_requires_permission(): void
    {
        $company = $this->company();
        $support = $this->user($company, 'support');

        $this->actingAs($support)->postJson('/api/queue/failed/job-uuid/retry')
            ->assertForbidden();
    }

    public function test_analytics_and_executive_require_permissions(): void
    {
        $company = $this->company();
        $user = User::factory()->create(['company_id' => $company->id]);
        $support = $this->user($company, 'support');

        $this->actingAs($user)->getJson('/api/analytics/overview')->assertForbidden();
        $this->actingAs($user)->getJson('/api/analytics/executive')->assertForbidden();

        $this->actingAs($support)->getJson('/api/analytics/overview')->assertOk();
        $this->actingAs($support)->getJson('/api/analytics/executive')->assertForbidden();
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
            'name' => 'Company '.uniqid(),
            'email' => uniqid('company').'@example.test',
            'is_active' => true,
        ]);
    }

    private function paymentForCompany(Company $company): Payment
    {
        $provider = PaymentProvider::query()->where('code', 'offline')->first()
            ?? PaymentProvider::query()->firstOrFail();
        $account = PaymentAccount::create([
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Offline POS',
            'settings' => ['endpoints' => []],
            'is_active' => true,
        ]);
        $order = Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'manual',
            'marketplace_order_id' => 'order-'.$company->id.'-'.uniqid(),
            'customer_name' => 'Test Customer',
            'total_amount' => 100,
            'status' => 'new',
        ]);

        return Payment::create([
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'provider_code' => $provider->code,
            'method' => 'card',
            'status' => 'paid',
            'amount' => 100,
            'refunded_amount' => 0,
        ]);
    }

    private function shipmentForCompany(Company $company): Shipment
    {
        $carrier = ShippingCarrier::query()->firstOrFail();
        $account = ShippingAccount::create([
            'company_id' => $company->id,
            'shipping_carrier_id' => $carrier->id,
            'name' => 'Test Carrier',
            'settings' => ['endpoints' => []],
            'is_active' => true,
        ]);
        $order = Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'manual',
            'marketplace_order_id' => 'shipment-'.$company->id.'-'.uniqid(),
            'customer_name' => 'Test Customer',
            'total_amount' => 100,
            'status' => 'new',
        ]);

        return Shipment::create([
            'order_id' => $order->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => $carrier->code,
            'status' => 'queued',
            'last_action' => 'label',
        ]);
    }
}
