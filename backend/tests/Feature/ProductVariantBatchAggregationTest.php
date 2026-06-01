<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use App\Services\Products\ProductVariantRollupService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductVariantBatchAggregationTest extends TestCase
{
    use RefreshDatabase;

    public function test_parent_batch_rollup_counts_child_statuses_and_applies_priority(): void
    {
        $parent = $this->parentProduct();
        $approved = $this->childProduct($parent, 'APPROVED-BATCH');
        $queued = $this->childProduct($parent, 'QUEUED-BATCH');
        $failed = $this->childProduct($parent, 'FAILED-BATCH');
        $rejected = $this->childProduct($parent, 'REJECTED-BATCH');

        $approved->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'approved']);
        $queued->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'queued']);
        $failed->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'failed']);
        $rejected->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'rejected']);

        $rollup = app(ProductVariantRollupService::class)->marketplaceStatuses($parent->fresh('variants.marketplaceStatuses'));

        $this->assertSame('failed', $rollup['trendyol']['rollup_status']);
        $this->assertSame(1, $rollup['trendyol']['approved_children']);
        $this->assertSame(1, $rollup['trendyol']['queued_children']);
        $this->assertSame(1, $rollup['trendyol']['failed_children']);
        $this->assertSame(1, $rollup['trendyol']['rejected_children']);
    }

    public function test_rejected_priority_is_used_when_no_failed_children_exist(): void
    {
        $parent = $this->parentProduct();
        $this->childProduct($parent, 'APPROVED-ONLY')->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'approved']);
        $this->childProduct($parent, 'REJECTED-ONLY')->marketplaceStatuses()->create(['marketplace_code' => 'trendyol', 'status' => 'rejected']);

        $rollup = app(ProductVariantRollupService::class)->marketplaceStatuses($parent->fresh('variants.marketplaceStatuses'));

        $this->assertSame('rejected', $rollup['trendyol']['rollup_status']);
    }

    public function test_parent_batch_rollup_selects_latest_batch_and_dates(): void
    {
        $parent = $this->parentProduct();
        $old = $this->childProduct($parent, 'OLD-BATCH');
        $latest = $this->childProduct($parent, 'LATEST-BATCH');

        $old->marketplaceStatuses()->create([
            'marketplace_code' => 'trendyol',
            'status' => 'queued',
            'batch_request_id' => 'old-batch',
            'last_sent_at' => now()->subDays(2),
            'last_checked_at' => now()->subDay(),
        ]);
        $latest->marketplaceStatuses()->create([
            'marketplace_code' => 'trendyol',
            'status' => 'queued',
            'batch_request_id' => 'latest-batch',
            'last_sent_at' => now()->subHour(),
            'last_checked_at' => now(),
        ]);

        $rollup = app(ProductVariantRollupService::class)->marketplaceStatuses($parent->fresh('variants.marketplaceStatuses'));

        $this->assertSame('latest-batch', $rollup['trendyol']['last_batch_request_id']);
        $this->assertNotNull($rollup['trendyol']['last_sent_at']);
        $this->assertNotNull($rollup['trendyol']['last_checked_at']);
    }

    public function test_problem_children_are_capped_and_include_operational_fields(): void
    {
        $parent = $this->parentProduct();

        foreach (range(1, 25) as $index) {
            $child = $this->childProduct($parent, sprintf('PROBLEM-%02d', $index));
            $child->marketplaceStatuses()->create([
                'marketplace_code' => 'trendyol',
                'status' => $index % 2 === 0 ? 'rejected' : 'failed',
                'error_message' => 'Problem '.$index,
                'batch_request_id' => 'batch-'.$index,
                'last_checked_at' => now()->subMinutes($index),
            ]);
        }

        $rollup = app(ProductVariantRollupService::class)->marketplaceStatuses($parent->fresh('variants.marketplaceStatuses'));

        $this->assertCount(20, $rollup['trendyol']['problem_children']);
        $this->assertSame('PROBLEM-01', $rollup['trendyol']['problem_children'][0]['sku']);
        $this->assertSame('869PROBLEM-01', $rollup['trendyol']['problem_children'][0]['barcode']);
        $this->assertSame('trendyol', $rollup['trendyol']['problem_children'][0]['marketplace_code']);
        $this->assertSame('failed', $rollup['trendyol']['problem_children'][0]['status']);
        $this->assertSame('Problem 1', $rollup['trendyol']['problem_children'][0]['error_message']);
        $this->assertSame('batch-1', $rollup['trendyol']['problem_children'][0]['batch_request_id']);
        $this->assertNotNull($rollup['trendyol']['problem_children'][0]['last_checked_at']);
    }

    public function test_product_controller_returns_extended_parent_batch_rollup(): void
    {
        $parent = $this->parentProduct();
        $child = $this->childProduct($parent, 'API-BATCH');
        $child->marketplaceStatuses()->create([
            'marketplace_code' => 'trendyol',
            'status' => 'failed',
            'error_message' => 'API error',
            'batch_request_id' => 'api-batch',
            'last_checked_at' => now(),
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $parent->company_id]));

        $this->getJson("/api/products/{$parent->id}")
            ->assertOk()
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.rollup_status', 'failed')
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.failed_children', 1)
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.last_batch_request_id', 'api-batch')
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.problem_children.0.sku', 'API-BATCH')
            ->assertJsonPath('variant_marketplace_status_rollup.trendyol.problem_children.0.error_message', 'API error');
    }

    public function test_simple_product_response_does_not_include_parent_batch_rollup(): void
    {
        $company = $this->company();
        $product = Product::create([
            'company_id' => $company->id,
            'sku' => 'SIMPLE-BATCH',
            'name' => 'Simple Batch',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson("/api/products/{$product->id}")
            ->assertOk()
            ->assertJsonMissingPath('variant_marketplace_status_rollup');
    }

    private function parentProduct(): Product
    {
        return Product::create([
            'company_id' => $this->company()->id,
            'sku' => 'PARENT-BATCH',
            'name' => 'Parent Batch',
            'product_type' => 'parent',
            'price' => 100,
            'stock' => 0,
            'status' => 'active',
        ]);
    }

    private function childProduct(Product $parent, string $sku): Product
    {
        return Product::create([
            'company_id' => $parent->company_id,
            'parent_product_id' => $parent->id,
            'sku' => $sku,
            'barcode' => '869'.$sku,
            'name' => $sku,
            'product_type' => 'variant',
            'variant_group_key' => 'batch-group',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Batch Aggregation Tenant '.uniqid(),
            'email' => uniqid('batch-aggregation').'@example.test',
            'is_active' => true,
        ]);
    }
}
