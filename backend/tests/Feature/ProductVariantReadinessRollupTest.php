<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use App\Services\Products\ProductReadinessService;
use App\Services\Products\ProductVariantRollupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductVariantReadinessRollupTest extends TestCase
{
    use RefreshDatabase;

    public function test_parent_provider_candidate_stays_blocked_without_status_record(): void
    {
        $parent = $this->parentProduct();

        $result = app(ProductReadinessService::class)->check($parent);

        $this->assertFalse($result['ready']);
        $this->assertSame(['provider_candidate'], $result['marketplaces']['trendyol']['missing_fields']);
        $this->assertSame(0, $parent->marketplaceStatuses()->count());
    }

    public function test_parent_readiness_rollup_counts_children_and_missing_fields(): void
    {
        $parent = $this->parentProduct();
        $this->childProduct($parent, 'READY-CHILD', true);
        $this->childProduct($parent, 'BLOCKED-CHILD', false, ['barcode', 'image']);

        $rollup = app(ProductVariantRollupService::class)->readiness($parent->fresh('variants'));

        $this->assertSame(2, $rollup['total_children']);
        $this->assertSame(1, $rollup['ready_children']);
        $this->assertSame(1, $rollup['blocked_children']);
        $this->assertSame(75, $rollup['readiness_score']);
        $this->assertSame(1, $rollup['missing_fields_summary']['barcode']);
        $this->assertSame(1, $rollup['missing_fields_summary']['image']);
    }

    public function test_parent_marketplace_status_rollup_prioritizes_child_statuses(): void
    {
        $parent = $this->parentProduct();
        $queued = $this->childProduct($parent, 'QUEUED-CHILD', true);
        $failed = $this->childProduct($parent, 'FAILED-CHILD', true);
        $approved = $this->childProduct($parent, 'APPROVED-CHILD', true);
        $queued->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'queued', 'readiness_status' => 'ready']);
        $failed->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'failed', 'readiness_status' => 'ready']);
        $approved->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'approved', 'readiness_status' => 'ready']);
        foreach ([$queued, $failed, $approved] as $child) {
            $child->marketplaceStatuses()->create(['marketplace_code' => 'hepsiburada', 'status' => 'approved', 'readiness_status' => 'ready']);
        }

        $rollup = app(ProductVariantRollupService::class)->marketplaceStatuses($parent->fresh('variants.marketplaceStatuses'));

        $this->assertSame('failed', $rollup['trendyol']['rollup_status']);
        $this->assertSame(1, $rollup['trendyol']['failed_children']);
        $this->assertSame('approved', $rollup['hepsiburada']['rollup_status']);
        $this->assertSame(3, $rollup['hepsiburada']['approved_children']);
    }

    public function test_product_controller_returns_rollup_fields_for_parent(): void
    {
        $parent = $this->parentProduct();
        $this->childProduct($parent, 'READY-API', true);
        $this->childProduct($parent, 'BLOCKED-API', false, ['required_attributes']);
        Sanctum::actingAs(User::factory()->create(['company_id' => $parent->company_id]));

        $this->getJson("/api/products/{$parent->id}")
            ->assertOk()
            ->assertJsonPath('variant_readiness_rollup.total_children', 2)
            ->assertJsonPath('variant_readiness_rollup.ready_children', 1)
            ->assertJsonPath('variant_readiness_rollup.blocked_children', 1)
            ->assertJsonPath('variant_readiness_rollup.missing_fields_summary.required_attributes', 1)
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.rollup_status', 'not_ready');

        $this->getJson('/api/products')
            ->assertOk()
            ->assertJsonPath('data.0.variant_readiness_rollup.total_children', 2);
    }

    public function test_simple_product_readiness_behavior_is_unchanged(): void
    {
        $company = $this->company();
        $product = Product::create([
            'company_id' => $company->id,
            'sku' => 'SIMPLE-ROLLUP',
            'barcode' => '869SIMPLE',
            'name' => 'Simple Rollup',
            'brand' => 'Brand',
            'category' => 'Category',
            'description' => 'Description',
            'price' => 100,
            'stock' => 4,
            'vat_rate' => 20,
            'status' => 'active',
        ]);

        $result = app(ProductReadinessService::class)->check($product, 'trendyol');

        $this->assertArrayNotHasKey('variant_readiness_rollup', $result);
        $this->assertSame(1, $product->marketplaceStatuses()->where('marketplace_code', 'trendyol')->count());
    }

    private function parentProduct(): Product
    {
        return Product::create([
            'company_id' => $this->company()->id,
            'sku' => 'PARENT-ROLLUP',
            'name' => 'Parent Rollup',
            'product_type' => 'parent',
            'price' => 100,
            'stock' => 0,
            'status' => 'active',
        ]);
    }

    private function childProduct(Product $parent, string $sku, bool $ready, array $missingFields = []): Product
    {
        return Product::create([
            'company_id' => $parent->company_id,
            'parent_product_id' => $parent->id,
            'sku' => $sku,
            'barcode' => '869'.$sku,
            'name' => $sku,
            'product_type' => 'variant',
            'variant_group_key' => 'rollup-group',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
            'marketplace_ready' => $ready,
            'marketplace_readiness' => [
                'trendyol' => [
                    'ready' => $ready,
                    'score' => $ready ? 100 : 50,
                    'missing_fields' => $missingFields,
                ],
                'hepsiburada' => [
                    'ready' => $ready,
                    'score' => $ready ? 100 : 50,
                    'missing_fields' => $missingFields,
                ],
            ],
        ]);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Rollup Tenant '.uniqid(),
            'email' => uniqid('rollup').'@example.test',
            'is_active' => true,
        ]);
    }
}
