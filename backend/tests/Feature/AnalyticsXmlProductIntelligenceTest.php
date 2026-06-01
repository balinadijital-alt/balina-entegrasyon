<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\User;
use App\Models\XmlSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AnalyticsXmlProductIntelligenceTest extends TestCase
{
    use RefreshDatabase;

    public function test_xml_and_product_intelligence_are_scoped_to_tenant(): void
    {
        $company = $this->company('Tenant A');
        $other = $this->company('Tenant B');
        $this->xmlSource($company, 'Tenant Source', 'completed');
        $this->xmlSource($other, 'Other Source', 'failed', 'Remote failed');
        $this->product($company, 'TENANT-READY', true);
        $this->product($other, 'OTHER-READY', true);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('xml_intelligence.health_summary.total_sources', 1)
            ->assertJsonPath('xml_intelligence.sources.0.source_name', 'Tenant Source')
            ->assertJsonPath('product_intelligence.readiness.total_products', 1);
    }

    public function test_xml_source_health_marks_failed_source_as_critical(): void
    {
        $company = $this->company();
        $this->xmlSource($company, 'Healthy XML', 'completed');
        $this->xmlSource($company, 'Failed XML', 'failed', 'HTTP 500');
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('xml_intelligence.health_summary.total_sources', 2)
            ->assertJsonPath('xml_intelligence.health_summary.healthy_sources', 1)
            ->assertJsonPath('xml_intelligence.health_summary.critical_sources', 1);
    }

    public function test_xml_mapping_conflict_and_filter_aggregates_are_calculated(): void
    {
        $company = $this->company();
        $source = $this->xmlSource($company, 'Source XML', 'completed_with_errors');
        ProductImportRun::create([
            'company_id' => $company->id,
            'xml_source_id' => $source->id,
            'source_type' => 'xml',
            'field_mapping' => [],
            'status' => 'completed_with_errors',
            'total_rows' => 20,
            'processed_rows' => 10,
            'created_count' => 3,
            'updated_count' => 4,
            'skipped_count' => 3,
            'error_count' => 1,
            'report' => [
                'mapped_category_count' => 4,
                'mapped_brand_count' => 2,
                'unmapped_category_count' => 1,
                'unmapped_brand_count' => 2,
                'conflict_count' => 2,
                'filtered_count' => 3,
                'conflict_rows' => [
                    ['row_number' => 2, 'sku' => 'SKU-1', 'reason' => 'xml_source_conflict'],
                ],
                'filtered_rows' => [
                    ['row_number' => 3, 'sku' => 'SKU-2', 'reason' => 'stock_zero'],
                    ['row_number' => 4, 'sku' => 'SKU-3', 'reason' => 'stock_zero'],
                    ['row_number' => 5, 'sku' => 'SKU-4', 'reason' => 'category_blocked'],
                ],
            ],
        ])->forceFill(['created_at' => '2026-05-15 10:00:00', 'updated_at' => '2026-05-15 10:00:00'])->save();
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('xml_intelligence.performance.total_runs', 1)
            ->assertJsonPath('xml_intelligence.performance.total_rows', 20)
            ->assertJsonPath('xml_intelligence.conflicts.total_conflicts', 2)
            ->assertJsonPath('xml_intelligence.conflicts.conflict_rate', 20)
            ->assertJsonPath('xml_intelligence.mapping.mapped_category_count', 4)
            ->assertJsonPath('xml_intelligence.mapping.mapped_brand_count', 2)
            ->assertJsonPath('xml_intelligence.mapping.category_mapping_success_rate', 80)
            ->assertJsonPath('xml_intelligence.mapping.brand_mapping_success_rate', 50)
            ->assertJsonPath('xml_intelligence.filters.filtered_count', 3)
            ->assertJsonPath('xml_intelligence.filters.filter_rate', 30)
            ->assertJsonPath('xml_intelligence.filters.filter_reason_breakdown.0.reason', 'stock_zero')
            ->assertJsonPath('xml_intelligence.filters.filter_reason_breakdown.0.count', 2);
    }

    public function test_product_readiness_ownership_variant_and_marketplace_aggregates_are_calculated(): void
    {
        $company = $this->company();
        $source = $this->xmlSource($company, 'Owned XML', 'completed');
        $this->product($company, 'READY', true, [], $source->id, 'READY');
        $this->product($company, 'BLOCKED', false, ['barcode', 'image'], $source->id, null);
        $this->product($company, 'MANUAL', true);
        $parent = $this->parentProduct($company, $source->id);
        $readyChild = $this->variantChild($parent, 'CHILD-READY', true, [], $source->id);
        $blockedChild = $this->variantChild($parent, 'CHILD-BLOCKED', false, ['category_mapping', 'attributes'], $source->id);
        $blockedChild->marketplaceStatuses()->create([
            'marketplace_code' => 'trendyol',
            'status' => 'failed',
            'readiness_status' => 'not_ready',
            'missing_fields' => ['category_mapping'],
            'error_message' => 'Category missing',
        ]);
        $readyChild->marketplaceStatuses()->create([
            'marketplace_code' => 'trendyol',
            'status' => 'approved',
            'readiness_status' => 'ready',
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('product_intelligence.readiness.total_products', 5)
            ->assertJsonPath('product_intelligence.readiness.ready_products', 3)
            ->assertJsonPath('product_intelligence.readiness.blocked_products', 2)
            ->assertJsonPath('product_intelligence.ownership.xml_owned_products', 5)
            ->assertJsonPath('product_intelligence.ownership.products_without_owner', 1)
            ->assertJsonPath('product_intelligence.ownership.source_product_code_coverage', 80)
            ->assertJsonPath('product_intelligence.variants.parent_count', 1)
            ->assertJsonPath('product_intelligence.variants.child_count', 2)
            ->assertJsonPath('product_intelligence.variants.ready_variant_children', 1)
            ->assertJsonPath('product_intelligence.variants.blocked_variant_children', 1)
            ->assertJsonPath('product_intelligence.variants.parents_with_problem_children', 1)
            ->assertJsonPath('product_intelligence.parent_child.avg_children_per_parent', 2)
            ->assertJsonPath('product_intelligence.marketplace_readiness.trendyol.ready', 3)
            ->assertJsonPath('product_intelligence.marketplace_readiness.trendyol.blocked', 2)
            ->assertJsonPath('product_intelligence.missing_field_heatmap.0.field', 'barcode')
            ->assertJsonPath('product_intelligence.missing_field_heatmap.0.count', 2);
    }

    public function test_parent_products_do_not_pollute_readiness_ratio(): void
    {
        $company = $this->company();
        $this->parentProduct($company);
        $this->product($company, 'READY-SIMPLE', true);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson('/api/analytics/overview?from=2026-05-01&to=2026-05-31')
            ->assertOk()
            ->assertJsonPath('product_intelligence.readiness.total_products', 1)
            ->assertJsonPath('product_intelligence.readiness.ready_products', 1)
            ->assertJsonPath('product_intelligence.readiness.readiness_rate', 100);
    }

    private function company(string $name = 'Analytics Tenant'): Company
    {
        return Company::create([
            'name' => $name.' '.Str::random(5),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function xmlSource(Company $company, string $name, string $status, ?string $error = null): XmlSource
    {
        return XmlSource::create([
            'company_id' => $company->id,
            'name' => $name,
            'supplier_name' => $name.' Supplier',
            'url' => 'https://example.test/feed.xml',
            'frequency_minutes' => 1440,
            'field_mapping' => [],
            'options' => [],
            'last_status' => $status,
            'last_error' => $error,
            'last_import_at' => now()->subDay(),
            'is_active' => true,
        ]);
    }

    private function product(Company $company, string $sku, bool $ready, array $missing = [], ?int $xmlSourceId = null, ?string $sourceCode = null): Product
    {
        return Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $xmlSourceId,
            'source_product_code' => $sourceCode,
            'last_xml_sync_at' => $xmlSourceId ? '2026-05-15 10:00:00' : null,
            'sku' => $sku,
            'barcode' => $ready ? '869'.$sku : null,
            'name' => $sku,
            'product_type' => 'standard',
            'brand' => 'Brand',
            'category' => 'Category',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
            'marketplace_ready' => $ready,
            'marketplace_readiness' => $this->readiness($ready, $missing),
        ]);
    }

    private function parentProduct(Company $company, ?int $xmlSourceId = null): Product
    {
        return Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $xmlSourceId,
            'source_product_code' => $xmlSourceId ? 'PARENT-CODE' : null,
            'last_xml_sync_at' => $xmlSourceId ? '2026-05-15 10:00:00' : null,
            'sku' => 'PARENT-'.Str::random(5),
            'name' => 'Parent',
            'product_type' => 'parent',
            'variant_group_key' => 'group-analytics',
            'price' => 100,
            'stock' => 0,
            'status' => 'active',
        ]);
    }

    private function variantChild(Product $parent, string $sku, bool $ready, array $missing, ?int $xmlSourceId = null): Product
    {
        return Product::create([
            'company_id' => $parent->company_id,
            'xml_source_id' => $xmlSourceId,
            'parent_product_id' => $parent->id,
            'source_product_code' => $sku,
            'last_xml_sync_at' => $xmlSourceId ? '2026-05-15 10:00:00' : null,
            'sku' => $sku,
            'barcode' => '869'.$sku,
            'name' => $sku,
            'product_type' => 'variant',
            'variant_group_key' => 'group-analytics',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
            'marketplace_ready' => $ready,
            'marketplace_readiness' => $this->readiness($ready, $missing),
        ]);
    }

    private function readiness(bool $ready, array $missing): array
    {
        return [
            'trendyol' => [
                'ready' => $ready,
                'score' => $ready ? 100 : 60,
                'missing_fields' => $missing,
            ],
            'hepsiburada' => [
                'ready' => $ready,
                'score' => $ready ? 100 : 60,
                'missing_fields' => $missing,
            ],
        ];
    }
}
