<?php

namespace Tests\Feature;

use App\Models\AccountingAccount;
use App\Models\AccountingIntegration;
use App\Models\AccountingLog;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Models\PaymentProvider;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AnalyticsFinanceLogisticsIntelligenceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
        Cache::flush();
    }

    public function test_finance_and_logistics_intelligence_are_scoped_to_tenant(): void
    {
        $company = $this->company('Tenant A');
        $other = $this->company('Tenant B');
        $this->payment($company, 'iyzico', 'paid', 100);
        $this->payment($other, 'iyzico', 'failed', 900, ['error_message' => 'Other failed']);
        $this->shipment($company, 'aras', 'delivered');
        $this->shipment($other, 'aras', 'failed', ['error_message' => 'Other shipment failed']);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('finance_intelligence.payment_health.total_payments', 1)
            ->assertJsonPath('finance_intelligence.payment_health.failed', 0)
            ->assertJsonPath('logistics_intelligence.shipping_health.total_shipments', 1)
            ->assertJsonPath('logistics_intelligence.shipping_health.failed_shipments', 0);
    }

    public function test_payment_refund_commission_and_accounting_analytics_are_calculated(): void
    {
        $company = $this->company('Finance');
        $paid = $this->payment($company, 'iyzico', 'paid', 1000, ['commission_rate' => 2, 'commission_amount' => 20]);
        $failed = $this->payment($company, 'iyzico', 'failed', 500, ['error_message' => 'Bank declined']);
        $this->payment($company, 'paytr', 'refunded', 300, ['refunded_amount' => 300, 'commission_rate' => 3, 'commission_amount' => 9]);
        $this->paymentLog($failed, 'failed', 'Bank declined');
        $this->invoice($company, 'issued', 1000);
        $failedInvoice = $this->invoice($company, 'failed', 500, ['error_message' => 'ERP failed']);
        $this->invoice($company, 'queued', 250);
        $this->invoice($company, 'queued', -100, ['type' => 'return']);
        $this->accountingLog($failedInvoice, 'failed', 'ERP failed');
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('finance_intelligence.payment_health.health', 'critical')
            ->assertJsonPath('finance_intelligence.payment_health.total_payments', 3)
            ->assertJsonPath('finance_intelligence.payment_health.failed', 1)
            ->assertJsonPath('finance_intelligence.payment_health.latest_failed.0.error_message', 'Bank declined')
            ->assertJsonPath('finance_intelligence.provider_performance.0.provider_code', 'iyzico')
            ->assertJsonPath('finance_intelligence.provider_performance.0.success_rate', 50)
            ->assertJsonPath('finance_intelligence.refunds.total_refunds', 1)
            ->assertJsonPath('finance_intelligence.refunds.refunded_amount', 300)
            ->assertJsonPath('finance_intelligence.commissions.total_commission_amount', 29)
            ->assertJsonPath('finance_intelligence.accounting_health.health', 'critical')
            ->assertJsonPath('finance_intelligence.invoice_success.total_invoices', 4)
            ->assertJsonPath('finance_intelligence.invoice_success.issued', 1)
            ->assertJsonPath('finance_intelligence.invoice_success.failed', 1)
            ->assertJsonPath('finance_intelligence.invoice_success.return_invoices', 1)
            ->assertJsonPath('finance_intelligence.accounting_errors.total_errors', 1);

        $this->assertGreaterThanOrEqual(60, $response->json('finance_intelligence.finance_risk.score'));
    }

    public function test_shipping_carrier_delivery_failed_and_risk_analytics_are_calculated(): void
    {
        $company = $this->company('Logistics');
        $this->shipment($company, 'aras', 'delivered', ['shipped_at' => '2026-05-10 10:00:00', 'delivered_at' => '2026-05-12 10:00:00']);
        $this->shipment($company, 'aras', 'failed', ['error_message' => 'Address invalid']);
        $this->shipment($company, 'yurtici', 'shipped', ['shipped_at' => now()->subDays(5)]);
        $this->shipment($company, 'yurtici', 'return_created', ['return_code' => 'RET-1']);
        $this->shippingAccount($company, 'yurtici', ['last_status' => 'failed', 'last_error' => 'Carrier auth failed']);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('logistics_intelligence.shipping_health.health', 'critical')
            ->assertJsonPath('logistics_intelligence.shipping_health.total_shipments', 4)
            ->assertJsonPath('logistics_intelligence.shipping_health.failed_shipments', 1)
            ->assertJsonPath('logistics_intelligence.shipping_health.delayed_shipments', 1)
            ->assertJsonPath('logistics_intelligence.delivery_performance.delivered_count', 1)
            ->assertJsonPath('logistics_intelligence.delivery_performance.in_transit_count', 1)
            ->assertJsonPath('logistics_intelligence.delivery_performance.delayed_shipments', 1)
            ->assertJsonPath('logistics_intelligence.delivery_performance.delayed_samples.0.carrier_code', 'yurtici')
            ->assertJsonPath('logistics_intelligence.failed_shipments.failed_count', 1)
            ->assertJsonPath('logistics_intelligence.failed_shipments.latest_failed.0.error_message', 'Address invalid');

        $this->assertGreaterThanOrEqual(60, $response->json('logistics_intelligence.logistics_risk.score'));
    }

    public function test_executive_endpoint_returns_finance_and_logistics_health(): void
    {
        $company = $this->company('Executive');
        $payment = $this->payment($company, 'iyzico', 'failed', 500, ['error_message' => 'Bank declined']);
        $invoice = $this->invoice($company, 'failed', 400, ['error_message' => 'ERP failed']);
        $this->paymentLog($payment, 'failed', 'Bank declined');
        $this->accountingLog($invoice, 'failed', 'ERP failed');
        $this->shipment($company, 'aras', 'failed', ['error_message' => 'Carrier failed']);
        $this->shipment($company, 'aras', 'shipped', ['shipped_at' => now()->subDays(5)]);
        $this->shipment($company, 'aras', 'return_created', ['return_code' => 'RET-EXEC']);
        $this->shippingAccount($company, 'aras', ['last_status' => 'failed', 'last_error' => 'Carrier auth failed']);
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/analytics/executive?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('health_scores.finance_health.health', 'critical')
            ->assertJsonPath('health_scores.payment_health.health', 'critical')
            ->assertJsonPath('health_scores.accounting_health.health', 'critical')
            ->assertJsonPath('health_scores.logistics_health.health', 'critical')
            ->assertJsonPath('health_scores.shipping_health.health', 'critical')
            ->assertJsonPath('finance_intelligence.payment_health.health', 'critical')
            ->assertJsonPath('logistics_intelligence.shipping_health.health', 'critical')
            ->assertJsonPath('finance_health', 'critical')
            ->assertJsonPath('payment_health', 'critical')
            ->assertJsonPath('accounting_health', 'critical')
            ->assertJsonPath('logistics_health', 'critical')
            ->assertJsonPath('shipping_health', 'critical');

        $this->assertGreaterThanOrEqual(60, $response->json('risk_overview.finance_risk'));
        $this->assertGreaterThanOrEqual(60, $response->json('risk_overview.logistics_risk'));
    }

    public function test_overview_contract_is_additive(): void
    {
        $company = $this->company('Contract');
        $this->payment($company, 'iyzico', 'paid', 100);
        $this->shipment($company, 'aras', 'delivered');
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonStructure([
                'sales',
                'payments',
                'shipping',
                'finance_intelligence' => ['payment_health', 'provider_performance', 'refunds', 'commissions', 'accounting_health', 'invoice_success', 'accounting_errors'],
                'logistics_intelligence' => ['shipping_health', 'carrier_performance', 'delivery_performance', 'failed_shipments', 'logistics_risk'],
            ]);
    }

    private function company(string $name): Company
    {
        return Company::create([
            'name' => $name.' '.Str::random(5),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function order(Company $company, int $amount = 100): Order
    {
        $order = Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'marketplace_order_id' => (string) Str::uuid(),
            'customer_name' => 'Customer',
            'total_amount' => $amount,
            'status' => 'delivered',
        ]);
        $order->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();

        return $order;
    }

    private function payment(Company $company, string $provider, string $status, int $amount, array $overrides = []): Payment
    {
        $account = $this->paymentAccount($company, $provider);
        $payment = Payment::create(array_merge([
            'order_id' => $this->order($company, $amount)->id,
            'payment_account_id' => $account->id,
            'provider_code' => $provider,
            'method' => 'card',
            'status' => $status,
            'amount' => $amount,
            'refunded_amount' => 0,
            'commission_rate' => 0,
            'commission_amount' => 0,
            'currency' => 'TRY',
        ], $overrides));
        $payment->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 11:00:00'])->save();

        return $payment->fresh(['order.company', 'account.provider']);
    }

    private function paymentAccount(Company $company, string $provider): PaymentAccount
    {
        $paymentProvider = PaymentProvider::firstOrCreate(
            ['code' => $provider],
            ['name' => strtoupper($provider), 'service_class' => 'FakePaymentService', 'capabilities' => [], 'is_active' => true]
        );

        return PaymentAccount::firstOrCreate(
            ['company_id' => $company->id, 'payment_provider_id' => $paymentProvider->id, 'name' => strtoupper($provider)],
            ['settings' => [], 'is_active' => true]
        );
    }

    private function paymentLog(Payment $payment, string $status, string $error): void
    {
        PaymentLog::create([
            'payment_id' => $payment->id,
            'payment_account_id' => $payment->payment_account_id,
            'provider_code' => $payment->provider_code,
            'event' => 'query',
            'status' => $status,
            'error_message' => $error,
            'duration_ms' => 1200,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function invoice(Company $company, string $status, int $amount, array $overrides = []): Invoice
    {
        $account = $this->accountingAccount($company, 'parasut');
        $invoice = Invoice::create(array_merge([
            'company_id' => $company->id,
            'order_id' => $this->order($company, abs($amount))->id,
            'accounting_account_id' => $account->id,
            'type' => 'einvoice',
            'scenario' => 'basic',
            'status' => $status,
            'subtotal' => $amount,
            'tax_total' => 0,
            'grand_total' => $amount,
            'lines' => [],
        ], $overrides));
        $invoice->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();

        return $invoice->fresh(['account.integration']);
    }

    private function accountingAccount(Company $company, string $provider): AccountingAccount
    {
        $integration = AccountingIntegration::firstOrCreate(
            ['code' => $provider],
            ['name' => strtoupper($provider), 'service_class' => 'FakeAccountingService', 'capabilities' => [], 'is_active' => true]
        );

        return AccountingAccount::firstOrCreate(
            ['company_id' => $company->id, 'accounting_integration_id' => $integration->id, 'name' => strtoupper($provider)],
            ['settings' => [], 'is_active' => true]
        );
    }

    private function accountingLog(Invoice $invoice, string $status, string $error): void
    {
        AccountingLog::create([
            'accounting_account_id' => $invoice->accounting_account_id,
            'invoice_id' => $invoice->id,
            'provider_code' => 'parasut',
            'event' => 'create_invoice',
            'status' => $status,
            'error_message' => $error,
            'duration_ms' => 1600,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function shipment(Company $company, string $carrier, string $status, array $overrides = []): Shipment
    {
        $account = $this->shippingAccount($company, $carrier);
        $shipment = Shipment::create(array_merge([
            'order_id' => $this->order($company)->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => $carrier,
            'status' => $status,
            'last_action' => 'create',
        ], $overrides));
        $shipment->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();

        return $shipment->fresh(['order.company', 'account.carrier']);
    }

    private function shippingAccount(Company $company, string $carrier, array $overrides = []): ShippingAccount
    {
        $shippingCarrier = ShippingCarrier::firstOrCreate(
            ['code' => $carrier],
            ['name' => strtoupper($carrier), 'service_class' => 'FakeShippingService', 'capabilities' => [], 'is_active' => true]
        );

        $account = ShippingAccount::firstOrCreate(
            ['company_id' => $company->id, 'shipping_carrier_id' => $shippingCarrier->id, 'name' => strtoupper($carrier)],
            ['settings' => [], 'is_active' => true]
        );

        if ($overrides !== []) {
            $account->forceFill($overrides)->save();
        }

        return $account;
    }
}
