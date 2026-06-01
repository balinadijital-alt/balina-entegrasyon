<?php

namespace Tests\Feature;

use App\Models\ApiLog;
use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Product;
use App\Models\SyncRun;
use App\Models\User;
use App\Models\WebhookDeliveryLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnalyticsMarketplaceOperationsIntelligenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_marketplace_intelligence_is_scoped_to_authenticated_tenant(): void
    {
        $company = $this->company('Tenant A');
        $other = $this->company('Tenant B');
        $this->account($company, 'trendyol');
        $this->account($other, 'trendyol', ['connection_status' => 'failed', 'last_error' => 'Other failed']);
        $this->marketplaceStatus($this->product($company, 'TENANT-1'), 'trendyol', 'approved');
        $this->marketplaceStatus($this->product($other, 'OTHER-1'), 'trendyol', 'rejected', ['error_message' => 'Other rejected']);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.approved', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.rejected', 0)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.failed_accounts', 0)
            ->assertJsonPath('marketplace_intelligence.rejected_products.total', 0);
    }

    public function test_marketplace_health_and_product_status_aggregates_are_calculated(): void
    {
        $company = $this->company();
        $this->account($company, 'trendyol', ['connection_status' => 'failed', 'last_error' => 'Auth failed']);
        $this->account($company, 'hepsiburada');
        $this->marketplaceStatus($this->product($company, 'TY-APPROVED'), 'trendyol', 'approved', ['readiness_status' => 'ready']);
        $this->marketplaceStatus($this->product($company, 'TY-QUEUED'), 'trendyol', 'queued', ['readiness_status' => 'ready']);
        $this->marketplaceStatus($this->product($company, 'TY-SENT'), 'trendyol', 'sent');
        $this->marketplaceStatus($this->product($company, 'TY-FAILED'), 'trendyol', 'failed', ['readiness_status' => 'not_ready', 'error_message' => 'Provider failed']);
        $this->marketplaceStatus($this->product($company, 'TY-REJECTED'), 'trendyol', 'rejected', ['error_message' => 'Rejected barcode']);
        $this->marketplaceStatus($this->product($company, 'TY-PROBLEM'), 'trendyol', 'problematic', ['error_message' => 'Problematic']);
        $this->marketplaceStatus($this->product($company, 'TY-BLOCKED'), 'trendyol', 'blocked', ['error_message' => 'Blocked']);
        $this->marketplaceStatus($this->product($company, 'HB-APPROVED'), 'hepsiburada', 'approved', ['readiness_status' => 'ready']);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.health', 'critical')
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.failed_accounts', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.approved', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.queued', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.sent', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.failed', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.rejected', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.problematic', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.blocked', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.ready', 2)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.not_ready', 1)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.readiness_rate', 66.67)
            ->assertJsonPath('marketplace_intelligence.marketplaces.trendyol.success_rate', 20)
            ->assertJsonPath('marketplace_intelligence.marketplaces.hepsiburada.health', 'healthy')
            ->assertJsonPath('marketplace_intelligence.marketplaces.hepsiburada.approved', 1);
    }

    public function test_batch_rejected_failed_and_variant_problem_analytics_are_returned(): void
    {
        $company = $this->company();
        $parent = $this->parent($company);
        $childA = $this->variant($parent, 'CHILD-A');
        $childB = $this->variant($parent, 'CHILD-B');
        $this->marketplaceStatus($this->product($company, 'BATCH-OK'), 'trendyol', 'approved', ['batch_request_id' => 'batch-1']);
        $this->marketplaceStatus($childA, 'trendyol', 'failed', [
            'batch_request_id' => 'batch-1',
            'error_message' => 'Barcode invalid',
            'readiness_status' => 'not_ready',
            'missing_fields' => ['barcode'],
        ]);
        $this->marketplaceStatus($childB, 'hepsiburada', 'rejected', [
            'batch_request_id' => 'batch-2',
            'error_message' => 'Category rejected',
            'readiness_status' => 'not_ready',
            'missing_fields' => ['category'],
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace_intelligence.batch_success.total_batch_products', 3)
            ->assertJsonPath('marketplace_intelligence.batch_success.products_with_batch', 3)
            ->assertJsonPath('marketplace_intelligence.batch_success.approved_products', 1)
            ->assertJsonPath('marketplace_intelligence.batch_success.failed_products', 1)
            ->assertJsonPath('marketplace_intelligence.batch_success.rejected_products', 1)
            ->assertJsonPath('marketplace_intelligence.batch_success.batch_success_rate', 33.33)
            ->assertJsonPath('marketplace_intelligence.rejected_products.total', 1)
            ->assertJsonPath('marketplace_intelligence.rejected_products.latest.0.sku', 'CHILD-B')
            ->assertJsonPath('marketplace_intelligence.failed_products.total', 1)
            ->assertJsonPath('marketplace_intelligence.failed_products.latest.0.sku', 'CHILD-A')
            ->assertJsonPath('marketplace_intelligence.failed_products.top_error_messages.0.message', 'Barcode invalid')
            ->assertJsonPath('marketplace_intelligence.variant_problems.parents_with_problem_children', 1)
            ->assertJsonPath('marketplace_intelligence.variant_problems.problem_children_count', 2);
    }

    public function test_operations_intelligence_counts_queue_api_webhooks_risk_and_alerts(): void
    {
        $company = $this->company();
        $account = $this->account($company, 'trendyol', ['connection_status' => 'failed']);
        $this->marketplaceStatus($this->product($company, 'FAILED-PRODUCT'), 'trendyol', 'failed', [
            'batch_request_id' => 'batch-risk',
            'error_message' => 'Provider 500',
        ]);
        $this->syncRun($account, 'orders', 'failed', ['attempts' => 2, 'error_message' => 'Timeout']);
        $this->apiLog($company, 'trendyol', 422, '/products', 250, 'Validation failed');
        $this->apiLog($company, 'trendyol', 500, '/products', 1800, 'Server failed');
        $this->inboundWebhook($company, 'trendyol', 'processed');
        $this->inboundWebhook($company, 'trendyol', 'invalid_signature', ['signature_valid' => false]);
        $this->inboundWebhook($company, 'trendyol', 'unknown_account');
        $this->outboundWebhook($company, true);
        $this->outboundWebhook($company, false, ['status' => 'failed', 'last_error' => 'Remote failed']);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $response = $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('operations_intelligence.queue.failed_jobs', 1)
            ->assertJsonPath('operations_intelligence.queue.failed_sync_runs', 1)
            ->assertJsonPath('operations_intelligence.queue.retry_jobs', 1)
            ->assertJsonPath('operations_intelligence.api.total_requests', 2)
            ->assertJsonPath('operations_intelligence.api.api_errors', 2)
            ->assertJsonPath('operations_intelligence.api.status_4xx', 1)
            ->assertJsonPath('operations_intelligence.api.status_5xx', 1)
            ->assertJsonPath('operations_intelligence.api.slow_requests', 1)
            ->assertJsonPath('operations_intelligence.webhooks.inbound_success', 1)
            ->assertJsonPath('operations_intelligence.webhooks.inbound_invalid_signature', 1)
            ->assertJsonPath('operations_intelligence.webhooks.inbound_unknown_account', 1)
            ->assertJsonPath('operations_intelligence.webhooks.outbound_success', 1)
            ->assertJsonPath('operations_intelligence.webhooks.outbound_failed', 1)
            ->assertJsonPath('operations_intelligence.risk_score.health', 'critical');

        $alerts = collect($response->json('operations_intelligence.alerts'))->pluck('key');
        $this->assertTrue($alerts->contains('marketplace_account_failed'));
        $this->assertTrue($alerts->contains('provider_api_errors'));
        $this->assertTrue($alerts->contains('queue_failed_jobs'));
        $this->assertTrue($alerts->contains('webhook_invalid_signature'));
    }

    public function test_marketplace_code_filter_limits_marketplace_specific_intelligence(): void
    {
        $company = $this->company();
        $this->marketplaceStatus($this->product($company, 'TY-FAILED'), 'trendyol', 'failed', ['error_message' => 'TY failed']);
        $this->marketplaceStatus($this->product($company, 'HB-APPROVED'), 'hepsiburada', 'approved');
        $this->apiLog($company, 'trendyol', 500, '/ty', 100);
        $this->apiLog($company, 'hepsiburada', 200, '/hb', 100);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31&marketplace_code=hepsiburada')
            ->assertOk()
            ->assertJsonMissingPath('marketplace_intelligence.marketplaces.trendyol')
            ->assertJsonPath('marketplace_intelligence.marketplaces.hepsiburada.approved', 1)
            ->assertJsonPath('marketplace_intelligence.failed_products.total', 0)
            ->assertJsonPath('operations_intelligence.api.total_requests', 1)
            ->assertJsonPath('operations_intelligence.api.api_errors', 0);
    }

    private function company(string $name = 'Marketplace Analytics'): Company
    {
        return Company::create([
            'name' => $name.' '.Str::random(5),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
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
            'last_product_sync_at' => '2026-05-15 09:00:00',
            'last_price_sync_at' => '2026-05-15 09:05:00',
            'last_order_sync_at' => '2026-05-15 09:10:00',
        ], $overrides));
    }

    private function product(Company $company, string $sku, array $overrides = []): Product
    {
        return Product::create(array_merge([
            'company_id' => $company->id,
            'sku' => $sku,
            'barcode' => '869'.$sku,
            'name' => $sku,
            'product_type' => 'standard',
            'brand' => 'Brand',
            'category' => 'Category',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
            'marketplace_ready' => true,
            'marketplace_readiness' => [
                'trendyol' => ['ready' => true, 'score' => 100, 'missing_fields' => []],
                'hepsiburada' => ['ready' => true, 'score' => 100, 'missing_fields' => []],
            ],
        ], $overrides));
    }

    private function parent(Company $company): Product
    {
        return $this->product($company, 'PARENT-'.Str::random(4), [
            'product_type' => 'parent',
            'variant_group_key' => 'GROUP-1',
            'stock' => 0,
        ]);
    }

    private function variant(Product $parent, string $sku): Product
    {
        return $this->product($parent->company, $sku, [
            'parent_product_id' => $parent->id,
            'product_type' => 'variant',
            'variant_group_key' => $parent->variant_group_key,
        ]);
    }

    private function marketplaceStatus(Product $product, string $marketplace, string $status, array $overrides = []): void
    {
        $row = $product->marketplaceStatuses()->create(array_merge([
            'marketplace_code' => $marketplace,
            'status' => $status,
            'readiness_status' => 'unknown',
            'missing_fields' => [],
            'batch_request_id' => null,
            'last_sent_at' => '2026-05-15 10:00:00',
            'last_checked_at' => '2026-05-15 11:00:00',
        ], $overrides));
        $row->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 11:00:00'])->save();
    }

    private function syncRun(MarketplaceAccount $account, string $type, string $status, array $overrides = []): void
    {
        SyncRun::create(array_merge([
            'marketplace_account_id' => $account->id,
            'type' => $type,
            'status' => $status,
            'attempts' => 0,
        ], $overrides))->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function apiLog(Company $company, string $marketplace, int $statusCode, string $endpoint, int $duration, ?string $error = null): void
    {
        ApiLog::create([
            'company_id' => $company->id,
            'marketplace_code' => $marketplace,
            'method' => 'POST',
            'endpoint' => $endpoint,
            'status_code' => $statusCode,
            'duration_ms' => $duration,
            'error_message' => $error,
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function inboundWebhook(Company $company, string $marketplace, string $status, array $overrides = []): void
    {
        InboundWebhookDelivery::create(array_merge([
            'company_id' => $company->id,
            'marketplace_code' => $marketplace,
            'delivery_id' => (string) Str::uuid(),
            'idempotency_key' => (string) Str::uuid(),
            'event' => 'order.updated',
            'status' => $status,
            'signature_valid' => true,
            'last_error' => $status === 'processed' ? null : 'Webhook failed',
        ], $overrides))->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function outboundWebhook(Company $company, bool $success, array $overrides = []): void
    {
        WebhookDeliveryLog::create(array_merge([
            'company_id' => $company->id,
            'delivery_id' => (string) Str::uuid(),
            'event' => 'product.updated',
            'endpoint' => 'https://example.test/webhook',
            'status' => $success ? 'delivered' : 'failed',
            'success' => $success,
            'failed_at' => $success ? null : '2026-05-15 10:00:00',
        ], $overrides))->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }
}
