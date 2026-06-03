<?php

namespace Tests\Feature;

use App\Jobs\Shipping\ProcessShipmentJob;
use App\Models\AccountingAccount;
use App\Models\AccountingIntegration;
use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Models\PaymentProvider;
use App\Models\ProductImportRun;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\User;
use App\Models\XmlSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class SecurityTenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
    }

    public function test_tenant_cannot_see_or_operate_on_other_company_payments(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $ownPayment = $this->payment($own);
        $otherPayment = $this->payment($other);
        PaymentLog::create([
            'payment_id' => $otherPayment->id,
            'payment_account_id' => $otherPayment->payment_account_id,
            'provider_code' => $otherPayment->provider_code,
            'event' => 'query',
            'status' => 'failed',
        ]);
        $this->actingTenant($own);

        $this->getJson('/api/payments')
            ->assertOk()
            ->assertJsonFragment(['id' => $ownPayment->id])
            ->assertJsonMissing(['id' => $otherPayment->id]);

        $this->getJson('/api/payment-logs')->assertOk()->assertJsonMissing(['payment_id' => $otherPayment->id]);
        $this->postJson("/api/payments/{$otherPayment->id}/query")->assertForbidden();
        $this->postJson("/api/payments/{$otherPayment->id}/refund", ['amount' => 10])->assertForbidden();
    }

    public function test_tenant_cannot_attach_other_company_payment_account_to_own_order(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $order = $this->order($own);
        $otherAccount = $this->paymentAccount($other);
        $this->actingTenant($own);

        $this->postJson("/api/orders/{$order->id}/payments", [
            'payment_account_id' => $otherAccount->id,
            'amount' => 25,
        ])->assertForbidden();
    }

    public function test_tenant_cannot_see_or_operate_on_other_company_shipments(): void
    {
        Queue::fake();
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $ownShipment = $this->shipment($own);
        $otherShipment = $this->shipment($other);
        $this->actingTenant($own);

        $shipmentList = $this->getJson('/api/shipments')->assertOk()->json('data');
        $this->assertContains($ownShipment->id, collect($shipmentList)->pluck('id')->all());
        $this->assertNotContains($otherShipment->id, collect($shipmentList)->pluck('id')->all());

        $this->postJson('/api/shipments/bulk-labels', ['shipment_ids' => [$ownShipment->id, $otherShipment->id]])->assertForbidden();
        $this->postJson("/api/shipments/{$otherShipment->id}/track")->assertForbidden();
        $this->postJson("/api/shipments/{$otherShipment->id}/label")->assertForbidden();
        $this->postJson("/api/shipments/{$otherShipment->id}/retry")->assertForbidden();
        $this->getJson("/api/shipments/{$otherShipment->id}/label")->assertForbidden();

        Queue::assertNothingPushed();
    }

    public function test_tenant_cannot_attach_other_company_shipping_account_to_own_order(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $order = $this->order($own);
        $otherAccount = $this->shippingAccount($other);
        $this->actingTenant($own);

        $this->postJson("/api/orders/{$order->id}/shipments", [
            'shipping_account_id' => $otherAccount->id,
        ])->assertForbidden();
    }

    public function test_import_runs_and_xml_sources_are_explicitly_tenant_scoped(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $otherRun = ProductImportRun::create([
            'company_id' => $other->id,
            'source_type' => 'xml',
            'field_mapping' => [],
            'status' => 'completed',
        ]);
        $otherSource = XmlSource::create([
            'company_id' => $other->id,
            'name' => 'Other XML',
            'url' => 'https://example.test/feed.xml',
        ]);
        $this->actingTenant($own);

        $this->getJson("/api/import-runs/{$otherRun->id}")->assertForbidden();
        $this->postJson("/api/import-runs/{$otherRun->id}/retry")->assertForbidden();
        $this->postJson("/api/xml-sources/{$otherSource->id}/preview")->assertForbidden();
        $this->postJson("/api/xml-sources/{$otherSource->id}/import")->assertForbidden();
        $this->putJson("/api/xml-sources/{$otherSource->id}", ['name' => 'Changed'])->assertForbidden();
        $this->deleteJson("/api/xml-sources/{$otherSource->id}")->assertForbidden();
    }

    public function test_account_controllers_prevent_cross_tenant_update_and_company_override(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $otherPaymentAccount = $this->paymentAccount($other);
        $otherShippingAccount = $this->shippingAccount($other);
        $otherAccountingAccount = $this->accountingAccount($other);
        $otherMarketplace = MarketplaceAccount::create(['company_id' => $other->id, 'code' => 'trendyol', 'name' => 'Other TY']);
        $provider = PaymentProvider::firstOrCreate(['code' => 'iyzico'], ['name' => 'Iyzico', 'service_class' => 'Fake', 'capabilities' => [], 'is_active' => true]);
        $this->actingTenant($own);

        $created = $this->postJson('/api/payment-accounts', [
            'company_id' => $other->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Own Payment',
        ])->assertCreated()->json();
        $this->assertSame($own->id, $created['company_id']);

        $this->putJson("/api/payment-accounts/{$otherPaymentAccount->id}", ['name' => 'x'])->assertForbidden();
        $this->putJson("/api/shipping-accounts/{$otherShippingAccount->id}", ['name' => 'x'])->assertForbidden();
        $this->putJson("/api/accounting-accounts/{$otherAccountingAccount->id}", ['name' => 'x'])->assertForbidden();
        $this->putJson("/api/marketplaces/{$otherMarketplace->id}", ['company_id' => $own->id, 'code' => 'trendyol', 'name' => 'x'])->assertForbidden();
        $this->deleteJson("/api/payment-accounts/{$otherPaymentAccount->id}")->assertForbidden();
        $this->deleteJson("/api/shipping-accounts/{$otherShippingAccount->id}")->assertForbidden();
        $this->deleteJson("/api/marketplaces/{$otherMarketplace->id}")->assertForbidden();
    }

    public function test_generic_module_crud_is_tenant_scoped(): void
    {
        [$own, $other] = [$this->company('Own'), $this->company('Other')];
        $coupon = \App\Models\Marketing\Coupon::create([
            'company_id' => $other->id,
            'code' => 'OTHER10',
            'name' => 'Other coupon',
            'type' => 'fixed',
            'value' => 10,
        ]);
        $this->actingTenant($own);

        $this->getJson("/api/marketing/coupons/{$coupon->id}")->assertNotFound();
        $this->putJson("/api/marketing/coupons/{$coupon->id}", ['name' => 'Changed'])->assertNotFound();
        $this->deleteJson("/api/marketing/coupons/{$coupon->id}")->assertNotFound();
    }

    public function test_tenant_cannot_retry_global_failed_jobs_but_super_admin_can(): void
    {
        $company = $this->company('Tenant');
        $this->actingTenant($company);

        $this->getJson('/api/queue/status')
            ->assertOk()
            ->assertJsonPath('stats.failed_jobs', 0)
            ->assertJsonPath('failed_jobs', []);
        $this->postJson('/api/queue/failed/fake-uuid/retry')->assertForbidden();

        $admin = User::factory()->create();
        $admin->assignRole('super_admin');
        Sanctum::actingAs($admin);
        Artisan::shouldReceive('call')->once()->with('queue:retry', ['id' => ['fake-uuid']])->andReturn(0);

        $this->postJson('/api/queue/failed/fake-uuid/retry')->assertOk();
    }

    private function actingTenant(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        return $user;
    }

    private function company(string $name): Company
    {
        return Company::create([
            'name' => $name.' '.Str::random(5),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function order(Company $company): Order
    {
        return Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'marketplace_order_id' => (string) Str::uuid(),
            'customer_name' => 'Customer',
            'customer_email' => Str::uuid().'@example.test',
            'total_amount' => 100,
            'status' => 'new',
        ]);
    }

    private function payment(Company $company): Payment
    {
        return Payment::create([
            'order_id' => $this->order($company)->id,
            'payment_account_id' => $this->paymentAccount($company)->id,
            'provider_code' => 'iyzico',
            'method' => 'card',
            'status' => 'paid',
            'amount' => 100,
        ]);
    }

    private function paymentAccount(Company $company): PaymentAccount
    {
        $provider = PaymentProvider::firstOrCreate(
            ['code' => 'iyzico'],
            ['name' => 'Iyzico', 'service_class' => 'FakePaymentService', 'capabilities' => [], 'is_active' => true]
        );

        return PaymentAccount::create([
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Payment '.$company->id,
        ]);
    }

    private function shipment(Company $company): Shipment
    {
        $account = $this->shippingAccount($company);

        return Shipment::create([
            'order_id' => $this->order($company)->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => 'aras',
            'status' => 'queued',
        ]);
    }

    private function shippingAccount(Company $company): ShippingAccount
    {
        $carrier = ShippingCarrier::firstOrCreate(
            ['code' => 'aras'],
            ['name' => 'Aras', 'service_class' => 'FakeCargoService', 'capabilities' => [], 'is_active' => true]
        );

        return ShippingAccount::create([
            'company_id' => $company->id,
            'shipping_carrier_id' => $carrier->id,
            'name' => 'Shipping '.$company->id,
        ]);
    }

    private function accountingAccount(Company $company): AccountingAccount
    {
        $integration = AccountingIntegration::firstOrCreate(
            ['code' => 'parasut'],
            ['name' => 'Parasut', 'service_class' => 'FakeAccountingService', 'capabilities' => [], 'is_active' => true]
        );

        return AccountingAccount::create([
            'company_id' => $company->id,
            'accounting_integration_id' => $integration->id,
            'name' => 'Accounting '.$company->id,
        ]);
    }
}
