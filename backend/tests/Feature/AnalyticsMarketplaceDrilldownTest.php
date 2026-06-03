<?php

namespace Tests\Feature;

use App\Models\ApiLog;
use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Product;
use App\Models\SyncRun;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnalyticsMarketplaceDrilldownTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
    }

    public function test_tenant_scope_is_enforced_for_marketplace_drilldown(): void
    {
        $company = $this->company('Tenant A');
        $other = $this->company('Tenant B');
        $this->account($company, 'trendyol');
        $this->account($other, 'trendyol', ['connection_status' => 'failed', 'last_error' => 'Other failed']);
        $this->marketplaceStatus($this->product($company, 'TENANT-APPROVED'), 'trendyol', 'approved');
        $this->marketplaceStatus($this->product($other, 'OTHER-REJECTED'), 'trendyol', 'rejected', ['error_message' => 'Other rejected']);
        Sanctum::actingAs($this->analyticsUser($company));

        $this->getJson('/api/analytics/marketplaces/trendyol/drilldown?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace.code', 'trendyol')
            ->assertJsonPath('summary.rejected_products', 0)
            ->assertJsonPath('marketplace.failed_accounts', 0)
            ->assertJsonPath('summary.failed_products', 0);
    }

    public function test_trendyol_drilldown_returns_incidents_action_links_and_samples(): void
    {
        $company = $this->company();
        $account = $this->account($company, 'trendyol', [
            'connection_status' => 'failed',
            'last_error' => 'Credential failed',
            'last_product_sync_at' => '2026-05-01 10:00:00',
            'last_order_sync_at' => '2026-05-01 10:00:00',
        ]);
        $parent = $this->parent($company);
        $child = $this->variant($parent, 'CHILD-FAILED');
        $this->marketplaceStatus($this->product($company, 'FAILED-1'), 'trendyol', 'failed', [
            'batch_request_id' => 'batch-failed',
            'error_message' => 'Provider failed',
        ]);
        $this->marketplaceStatus($this->product($company, 'REJECTED-1'), 'trendyol', 'rejected', [
            'batch_request_id' => 'batch-failed',
            'error_message' => 'Barcode rejected',
        ]);
        $this->marketplaceStatus($child, 'trendyol', 'rejected', [
            'batch_request_id' => 'batch-variant',
            'error_message' => 'Variant missing category',
            'readiness_status' => 'not_ready',
            'missing_fields' => ['category'],
        ]);
        $this->syncRun($account, 'products', 'failed', ['attempts' => 2, 'error_message' => 'Queue timeout']);
        $this->apiLog($company, 'trendyol', 500, '/products', 1500, 'Provider 500');
        $this->apiLog($company, 'trendyol', 422, '/products', 100, 'Validation failed');
        $this->inboundWebhook($company, 'trendyol', 'failed');
        Sanctum::actingAs($this->analyticsUser($company));

        $response = $this->getJson('/api/analytics/marketplaces/trendyol/drilldown?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace.code', 'trendyol')
            ->assertJsonPath('marketplace.health', 'critical')
            ->assertJsonPath('summary.failed_batches', 2)
            ->assertJsonPath('summary.rejected_products', 2)
            ->assertJsonPath('summary.failed_products', 1)
            ->assertJsonPath('summary.api_errors', 2)
            ->assertJsonPath('summary.queue_failures', 1)
            ->assertJsonPath('summary.webhook_failures', 1)
            ->assertJsonPath('summary.variant_problem_children', 1)
            ->assertJsonPath('summary.stale_sync', true)
            ->assertJsonPath('risk_score.health', 'critical')
            ->assertJsonPath('failed_products.0.sku', 'FAILED-1')
            ->assertJsonPath('api_errors.0.status_code', 500)
            ->assertJsonPath('queue_failures.0.type', 'products')
            ->assertJsonPath('webhook_failures.0.status', 'failed');

        $rejectedSkus = collect($response->json('rejected_products'))->pluck('sku');
        $this->assertTrue($rejectedSkus->contains('CHILD-FAILED'));
        $this->assertTrue($rejectedSkus->contains('REJECTED-1'));

        $incidentKeys = collect($response->json('incidents'))->pluck('key');
        $this->assertTrue($incidentKeys->contains('marketplace_account_failed'));
        $this->assertTrue($incidentKeys->contains('failed_batch'));
        $this->assertTrue($incidentKeys->contains('api_errors'));
        $this->assertTrue($incidentKeys->contains('queue_failed'));
        $this->assertTrue($incidentKeys->contains('webhook_failed'));
        $this->assertTrue($incidentKeys->contains('stale_sync'));
        $this->assertTrue($incidentKeys->contains('variant_problem'));

        $targets = collect($response->json('action_links'))->pluck('target');
        $this->assertTrue($targets->contains('/api-logs'));
        $this->assertTrue($targets->contains('/queue'));
        $this->assertTrue($targets->contains('/products/publish-queue'));
        $this->assertTrue($targets->contains('/marketplaces/trendyol'));
    }

    public function test_hepsiburada_drilldown_returns_marketplace_specific_data(): void
    {
        $company = $this->company();
        $this->account($company, 'hepsiburada');
        $this->marketplaceStatus($this->product($company, 'HB-APPROVED'), 'hepsiburada', 'approved');
        $this->marketplaceStatus($this->product($company, 'TY-FAILED'), 'trendyol', 'failed', ['error_message' => 'TY failed']);
        $this->apiLog($company, 'hepsiburada', 200, '/hb-products', 100);
        $this->apiLog($company, 'trendyol', 500, '/ty-products', 1000);
        Sanctum::actingAs($this->analyticsUser($company));

        $this->getJson('/api/analytics/marketplaces/hepsiburada/drilldown?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('marketplace.code', 'hepsiburada')
            ->assertJsonPath('summary.failed_products', 0)
            ->assertJsonPath('summary.api_errors', 0)
            ->assertJsonPath('marketplace.approved', null)
            ->assertJsonPath('action_links.4.target', '/marketplaces/hepsiburada');
    }

    public function test_sample_lists_are_capped(): void
    {
        $company = $this->company();
        $this->account($company, 'trendyol');

        for ($i = 1; $i <= 55; $i++) {
            $this->marketplaceStatus($this->product($company, 'REJECTED-'.$i), 'trendyol', 'rejected', [
                'error_message' => 'Rejected '.$i,
            ]);
            $this->apiLog($company, 'trendyol', 422, '/products/'.$i, 100, 'Validation '.$i);
        }

        for ($i = 1; $i <= 25; $i++) {
            $this->inboundWebhook($company, 'trendyol', 'failed', ['delivery_id' => 'delivery-'.$i]);
        }

        Sanctum::actingAs($this->analyticsUser($company));

        $response = $this->getJson('/api/analytics/marketplaces/trendyol/drilldown?from=2026-05-01&to=2026-05-31')
            ->assertOk();

        $this->assertCount(50, $response->json('rejected_products'));
        $this->assertCount(50, $response->json('api_errors'));
        $this->assertCount(20, $response->json('webhook_failures'));
        $this->assertLessThanOrEqual(30, count($response->json('incidents')));
    }

    public function test_overview_contract_still_returns_existing_fields(): void
    {
        $company = $this->company();
        $this->account($company, 'trendyol');
        Sanctum::actingAs($this->analyticsUser($company));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonStructure([
                'sales',
                'orders',
                'marketplace_intelligence',
                'operations_intelligence',
                'alerts',
            ]);
    }

    private function company(string $name = 'Drilldown Tenant'): Company
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
            'last_product_sync_at' => '2026-06-01 10:00:00',
            'last_price_sync_at' => '2026-06-01 10:05:00',
            'last_order_sync_at' => '2026-06-01 10:10:00',
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
            'variant_group_key' => 'GROUP-DRILL',
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
            'signature_valid' => $status !== 'invalid_signature',
            'last_error' => $status === 'processed' ? null : 'Webhook failed',
        ], $overrides))->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
    }

    private function analyticsUser(Company $company): User
    {
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'support', 'guard_name' => 'web']);

        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('support');

        return $user;
    }
}
