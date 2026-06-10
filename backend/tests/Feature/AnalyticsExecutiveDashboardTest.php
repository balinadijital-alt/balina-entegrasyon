<?php

namespace Tests\Feature;

use App\Models\ApiLog;
use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\SaasPlan;
use App\Models\Subscription;
use App\Models\SyncRun;
use App\Models\UsageCounter;
use App\Models\User;
use App\Models\WebhookDeliveryLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class AnalyticsExecutiveDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        Role::firstOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
        Cache::flush();
        Carbon::setTestNow('2026-06-01 12:00:00');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_super_admin_sees_platform_wide_executive_dashboard(): void
    {
        $pro = $this->plan('pro', 999);
        $starter = $this->plan('starter', 299);
        $first = $this->company('Alpha');
        $second = $this->company('Beta');
        $this->subscription($first, $pro, 'active');
        $this->subscription($second, $starter, 'trial');
        $this->order($first, 1000);
        $this->order($second, 400);
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/analytics/executive?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('executive_summary.active_companies', 2)
            ->assertJsonPath('executive_summary.active_subscriptions', 2)
            ->assertJsonPath('executive_summary.total_revenue', 1400)
            ->assertJsonPath('executive_summary.order_count', 2)
            ->assertJsonCount(2, 'tenant_scorecards')
            ->assertJsonPath('business_metrics.avg_order_value', 700)
            ->assertJsonPath('saas_intelligence.plan_distribution.0.count', 1);
    }

    public function test_tenant_sees_only_own_company_even_with_company_filter(): void
    {
        $plan = $this->plan('growth', 799);
        $own = $this->company('Own');
        $other = $this->company('Other');
        $this->subscription($own, $plan, 'active');
        $this->subscription($other, $plan, 'active');
        $this->order($own, 150);
        $this->order($other, 999);
        $user = User::factory()->create(['company_id' => $own->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson("/api/analytics/executive?from=2026-05-01&to=2026-05-31&company_id={$other->id}")
            ->assertForbidden();

        $this->getJson('/api/analytics/executive?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('filters.company_id', $own->id)
            ->assertJsonPath('executive_summary.total_revenue', 150)
            ->assertJsonCount(1, 'tenant_scorecards')
            ->assertJsonPath('tenant_scorecards.0.company_id', $own->id);
    }

    public function test_saas_intelligence_scorecards_risk_and_growth_are_calculated(): void
    {
        $plan = $this->plan('scale', 1499);
        $company = $this->company('Risky');
        $this->subscription($company, $plan, 'active', ['ends_at' => '2026-06-07 00:00:00']);
        $this->usage($company, 'products', 95, 100);
        $this->order($company, 2500);
        $account = $this->account($company, 'trendyol', ['connection_status' => 'failed']);
        $this->marketplaceStatus($this->product($company, 'RISK-1'), 'trendyol', 'rejected');
        $this->apiLog($company, 500);
        $this->syncRun($account, 'products', 'failed');
        $this->inboundWebhook($company, 'invalid_signature');
        $this->outboundWebhook($company, false);
        $this->importRun($company, 'failed');
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/analytics/executive?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('saas_intelligence.usage_limit_summary.limit_risk_companies', 1)
            ->assertJsonPath('saas_intelligence.subscription_health.expiring', 1)
            ->assertJsonPath('tenant_scorecards.0.company_id', $company->id)
            ->assertJsonPath('tenant_scorecards.0.health', 'critical')
            ->assertJsonPath('tenant_scorecards.0.usage_rate', 95)
            ->assertJsonPath('tenant_scorecards.0.api_errors', 1)
            ->assertJsonPath('tenant_scorecards.0.queue_failures', 1)
            ->assertJsonPath('tenant_scorecards.0.webhook_failures', 2)
            ->assertJsonPath('tenant_scorecards.0.xml_failed_runs', 1)
            ->assertJsonPath('tenant_scorecards.0.marketplace_failed_products', 1)
            ->assertJsonPath('risk_overview.critical_companies', 1)
            ->assertJsonPath('growth_signals.high_usage_companies.0.company_id', $company->id)
            ->assertJsonPath('growth_signals.upgrade_candidates.0.company_id', $company->id)
            ->assertJsonStructure([
                'executive_summary' => ['system_health', 'executive_risk_score', 'active_companies', 'active_subscriptions', 'total_revenue', 'order_count'],
                'business_metrics' => ['total_revenue', 'order_count', 'avg_order_value', 'daily_revenue', 'daily_orders'],
                'saas_intelligence' => ['plan_distribution', 'subscription_health', 'usage_limit_summary', 'expiring_subscriptions', 'trial_companies', 'license_risk'],
                'risk_overview' => ['critical_companies', 'warning_companies', 'marketplace_risk', 'xml_risk', 'queue_risk', 'api_risk', 'webhook_risk'],
                'health_scores' => ['saas_health', 'marketplace_health', 'xml_health', 'operations_health', 'api_health', 'webhook_health'],
                'top_risks',
                'growth_signals',
            ]);

        $this->assertGreaterThanOrEqual(60, $response->json('executive_summary.executive_risk_score'));
        $this->assertNotEmpty($response->json('top_risks'));
    }

    public function test_plan_and_health_filters_are_available_for_admins(): void
    {
        $pro = $this->plan('pro', 999);
        $starter = $this->plan('starter', 299);
        $healthy = $this->company('Healthy');
        $critical = $this->company('Critical');
        $this->subscription($healthy, $pro, 'active');
        $this->subscription($critical, $starter, 'cancelled');
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->getJson("/api/analytics/executive?from=2026-05-01&to=2026-05-31&plan={$starter->code}&health=warning")
            ->assertOk()
            ->assertJsonCount(1, 'tenant_scorecards')
            ->assertJsonPath('tenant_scorecards.0.company_id', $critical->id)
            ->assertJsonPath('tenant_scorecards.0.health', 'warning');
    }

    public function test_executive_dashboard_uses_cache_and_overview_still_works(): void
    {
        $company = $this->company('Cache');
        $this->subscription($company, $this->plan('cache', 199), 'active');
        $this->order($company, 300);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->getJson('/api/analytics/executive?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('executive_summary.total_revenue', 300);

        $this->assertTrue(Cache::has("analytics:executive:{$company->id}:all:all:2026-05-01:2026-05-31"));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('sales.total_sales', 300);
    }

    private function company(string $name): Company
    {
        return Company::create([
            'name' => $name.' '.Str::random(5),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function plan(string $code, int $price): SaasPlan
    {
        return SaasPlan::create([
            'code' => $code.'-'.Str::random(4),
            'name' => ucfirst($code),
            'monthly_price' => $price,
            'limits' => ['products' => 100],
            'features' => ['analytics'],
            'is_active' => true,
        ]);
    }

    private function subscription(Company $company, SaasPlan $plan, string $status, array $overrides = []): Subscription
    {
        return Subscription::create(array_merge([
            'company_id' => $company->id,
            'saas_plan_id' => $plan->id,
            'status' => $status,
            'starts_at' => '2026-05-01 00:00:00',
            'ends_at' => null,
        ], $overrides));
    }

    private function order(Company $company, int $amount): Order
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

    private function usage(Company $company, string $metric, int $used, int $limit): void
    {
        UsageCounter::create([
            'company_id' => $company->id,
            'metric' => $metric,
            'used' => $used,
            'limit' => $limit,
            'period_starts_at' => '2026-05-01 00:00:00',
            'period_ends_at' => '2026-05-31 23:59:59',
        ]);
    }

    private function account(Company $company, string $code, array $overrides = []): MarketplaceAccount
    {
        return MarketplaceAccount::create(array_merge([
            'company_id' => $company->id,
            'code' => $code,
            'name' => strtoupper($code),
            'is_active' => true,
            'connection_status' => 'connected',
        ], $overrides));
    }

    private function product(Company $company, string $sku): Product
    {
        return Product::create([
            'company_id' => $company->id,
            'sku' => $sku,
            'barcode' => '869'.$sku,
            'name' => $sku,
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);
    }

    private function marketplaceStatus(Product $product, string $marketplace, string $status): void
    {
        $row = $product->marketplaceStatuses()->create([
            'marketplace_code' => $marketplace,
            'status' => $status,
            'readiness_status' => 'not_ready',
            'missing_fields' => ['barcode'],
            'batch_request_id' => 'batch-risk',
            'last_sent_at' => '2026-05-15 10:00:00',
            'last_checked_at' => '2026-05-15 11:00:00',
        ]);
        $row->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 11:00:00'])->save();
    }

    private function apiLog(Company $company, int $status): void
    {
        ApiLog::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'method' => 'POST',
            'endpoint' => '/products',
            'status_code' => $status,
            'duration_ms' => 1200,
            'error_message' => 'Provider error',
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function syncRun(MarketplaceAccount $account, string $type, string $status): void
    {
        SyncRun::create([
            'marketplace_account_id' => $account->id,
            'type' => $type,
            'status' => $status,
            'attempts' => 1,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function inboundWebhook(Company $company, string $status): void
    {
        InboundWebhookDelivery::create([
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'delivery_id' => (string) Str::uuid(),
            'idempotency_key' => (string) Str::uuid(),
            'event' => 'order.updated',
            'status' => $status,
            'signature_valid' => $status !== 'invalid_signature',
            'last_error' => 'Webhook failed',
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function outboundWebhook(Company $company, bool $success): void
    {
        WebhookDeliveryLog::create([
            'company_id' => $company->id,
            'delivery_id' => (string) Str::uuid(),
            'event' => 'product.updated',
            'endpoint' => 'https://example.test/webhook',
            'status' => $success ? 'delivered' : 'failed',
            'success' => $success,
            'failed_at' => $success ? null : '2026-05-15 10:00:00',
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function importRun(Company $company, string $status): void
    {
        ProductImportRun::create([
            'company_id' => $company->id,
            'source_type' => 'xml',
            'field_mapping' => [],
            'status' => $status,
            'report' => [],
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }
}
