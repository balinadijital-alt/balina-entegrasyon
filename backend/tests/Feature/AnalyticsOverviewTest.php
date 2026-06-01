<?php

namespace Tests\Feature;

use App\Models\ApiLog;
use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductImportRun;
use App\Models\SyncRun;
use App\Models\User;
use App\Models\WebhookDeliveryLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnalyticsOverviewTest extends TestCase
{
    use RefreshDatabase;

    public function test_overview_is_scoped_to_authenticated_tenant(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test']);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test']);
        $this->order($company, 'trendyol', 120, 'delivered');
        $this->order($otherCompany, 'trendyol', 999, 'delivered');
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('filters.company_id', $company->id)
            ->assertJsonPath('sales.total_sales', 120)
            ->assertJsonPath('sales.order_count', 1)
            ->assertJsonPath('orders.delivered', 1);
    }

    public function test_overview_returns_domain_contract(): void
    {
        $company = Company::create(['name' => 'Tenant', 'email' => 'tenant@example.test']);
        $order = $this->order($company, 'trendyol', 240, 'pending');
        Payment::create([
            'order_id' => $order->id,
            'provider_code' => 'iyzico',
            'method' => 'card',
            'status' => 'paid',
            'amount' => 240,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        ProductImportRun::create([
            'company_id' => $company->id,
            'source_type' => 'xml',
            'field_mapping' => [],
            'status' => 'completed',
            'report' => ['filtered_count' => 3, 'conflict_count' => 2],
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        ApiLog::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'method' => 'GET',
            'endpoint' => '/products',
            'status_code' => 500,
            'duration_ms' => 1500,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        InboundWebhookDelivery::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'idempotency_key' => (string) Str::uuid(),
            'status' => 'failed',
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        WebhookDeliveryLog::create([
            'company_id' => $company->id,
            'delivery_id' => (string) Str::uuid(),
            'event' => 'order.created',
            'endpoint' => 'https://example.test/webhook',
            'status' => 'failed',
            'success' => false,
            'failed_at' => now(),
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31&marketplace_code=trendyol')
            ->assertOk()
            ->assertJsonStructure([
                'sales' => ['total_sales', 'order_count', 'avg_order_value', 'trend'],
                'orders' => ['pending', 'preparing', 'shipped', 'delivered', 'cancelled', 'trend'],
                'payments' => ['paid', 'failed', 'refunded'],
                'shipping' => ['delivered', 'pending', 'failed'],
                'imports' => ['successful_runs', 'failed_runs', 'filtered_rows', 'conflict_rows'],
                'queue' => ['pending_jobs', 'failed_jobs', 'retry_jobs'],
                'api' => ['api_errors', 'slow_requests', 'total_requests'],
                'webhooks' => ['inbound_success', 'inbound_failed', 'outbound_success', 'outbound_failed'],
                'saas' => ['active_subscriptions', 'expiring_subscriptions', 'limit_risk_companies'],
                'alerts',
            ])
            ->assertJsonPath('payments.paid', 1)
            ->assertJsonPath('imports.filtered_rows', 3)
            ->assertJsonPath('imports.conflict_rows', 2)
            ->assertJsonPath('api.api_errors', 1)
            ->assertJsonPath('api.slow_requests', 1)
            ->assertJsonPath('webhooks.inbound_failed', 1)
            ->assertJsonPath('webhooks.outbound_failed', 1);
    }

    public function test_date_filters_limit_orders(): void
    {
        $company = Company::create(['name' => 'Tenant', 'email' => 'tenant@example.test']);
        $inside = $this->order($company, 'trendyol', 100, 'delivered');
        $outside = $this->order($company, 'trendyol', 500, 'delivered');
        $inside->forceFill(['created_at' => '2026-05-10 10:00:00', 'updated_at' => '2026-05-10 10:00:00'])->save();
        $outside->forceFill(['created_at' => '2026-04-10 10:00:00', 'updated_at' => '2026-04-10 10:00:00'])->save();
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('sales.total_sales', 100)
            ->assertJsonPath('sales.order_count', 1);
    }

    public function test_marketplace_filter_limits_marketplace_metrics(): void
    {
        $company = Company::create(['name' => 'Tenant', 'email' => 'tenant@example.test']);
        $this->order($company, 'trendyol', 300, 'delivered');
        $this->order($company, 'hepsiburada', 700, 'delivered');
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31&marketplace_code=hepsiburada')
            ->assertOk()
            ->assertJsonPath('filters.marketplace_code', 'hepsiburada')
            ->assertJsonPath('sales.total_sales', 700)
            ->assertJsonPath('sales.order_count', 1);
    }

    public function test_overview_uses_cache_key_for_runtime_aggregate(): void
    {
        Cache::flush();
        $company = Company::create(['name' => 'Tenant', 'email' => 'tenant@example.test']);
        MarketplaceAccount::create(['company_id' => $company->id, 'code' => 'trendyol', 'name' => 'TY', 'is_active' => true]);
        SyncRun::create([
            'marketplace_account_id' => MarketplaceAccount::where('company_id', $company->id)->first()->id,
            'type' => 'orders',
            'status' => 'queued',
            'attempts' => 1,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('queue.pending_jobs', 1)
            ->assertJsonPath('queue.retry_jobs', 1);

        $this->assertTrue(Cache::has("analytics:overview:{$company->id}:all:2026-05-01:2026-05-31"));
    }

    private function order(Company $company, string $marketplaceCode, int $amount, string $status): Order
    {
        $order = Order::create([
            'company_id' => $company->id,
            'marketplace_code' => $marketplaceCode,
            'marketplace_order_id' => Str::uuid()->toString(),
            'customer_name' => 'Customer',
            'total_amount' => $amount,
            'status' => $status,
        ]);

        $order->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();

        return $order;
    }
}
