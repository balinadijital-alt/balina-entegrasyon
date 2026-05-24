<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\XmlSource;
use App\Services\Imports\ProductImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ProductImportRunDetailReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_filter_reason_is_written_to_run_report(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'LOW-STOCK', 'stock' => 1, 'category' => 'Shoes', 'brand' => 'Acme'],
            ['sku' => 'READY', 'stock' => 8, 'category' => 'Shoes', 'brand' => 'Acme'],
        ]), [
            'filters' => ['minimum_stock' => 5],
        ]);

        app(ProductImportService::class)->process($run);

        $report = $run->fresh()->report;
        $this->assertSame(1, $report['filtered_count']);
        $this->assertSame('LOW-STOCK', $report['filtered_rows'][0]['sku']);
        $this->assertSame('min_stock', $report['filtered_rows'][0]['reason']);
    }

    public function test_mapping_before_after_is_written_to_run_report(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'MAPPED', 'category' => '  Çocuk Ayakkabı  ', 'brand' => 'XML Brand'],
        ]), [
            'mappings' => [
                'categories' => ['cocuk ayakkabi' => 'Cocuk Ayakkabi'],
                'brands' => ['XML Brand' => 'Canonical Brand'],
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $mapped = $run->fresh()->report['mapped_rows'][0];
        $this->assertSame('MAPPED', $mapped['sku']);
        $this->assertSame('Çocuk Ayakkabı', $mapped['category_before']);
        $this->assertSame('Cocuk Ayakkabi', $mapped['category_after']);
        $this->assertSame('XML Brand', $mapped['brand_before']);
        $this->assertSame('Canonical Brand', $mapped['brand_after']);
        $this->assertSame('normalized', $mapped['mapping_type']);
    }

    public function test_price_diff_is_written_to_run_report(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'PRICE-DIFF', 'price' => 100],
        ]), [
            'pricing' => [
                'price_multiplier' => 1.5,
                'source_profit_rate' => 10,
                'rounding_mode' => 'nearest_99',
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $price = $run->fresh()->report['price_changed_rows'][0];
        $this->assertSame('PRICE-DIFF', $price['sku']);
        $this->assertEquals(100.0, $price['price_before']);
        $this->assertEquals(165.99, $price['price_after']);
        $this->assertSame(1.5, $price['multiplier']);
        $this->assertSame(10, $price['profit_rate']);
        $this->assertSame('nearest_99', $price['rounding_mode']);
    }

    public function test_stock_strategy_detail_is_written_to_run_report(): void
    {
        $company = $this->company();
        Product::create([
            'company_id' => $company->id,
            'supplier_name' => 'XML Supplier',
            'sku' => 'OLD-SKU',
            'name' => 'Old Product',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);

        $run = $this->runForXml($company, $this->xml([
            ['sku' => 'NEW-SKU'],
        ]), [
            'stock_strategy' => ['missing_product_action' => 'zero_stock_missing'],
        ]);

        app(ProductImportService::class)->process($run);

        $stock = $run->fresh()->report['stock_strategy_rows'][0];
        $this->assertSame('OLD-SKU', $stock['sku']);
        $this->assertSame('zero_stock', $stock['action']);
        $this->assertSame(12, $stock['previous_stock']);
        $this->assertSame(0, $stock['new_stock']);
    }

    public function test_report_detail_lists_are_capped_and_legacy_counters_still_work(): void
    {
        $rows = collect(range(1, 105))
            ->map(fn (int $index) => ['sku' => "LOW-{$index}", 'stock' => 0])
            ->all();

        $run = $this->runForXml($this->company(), $this->xml($rows), [
            'filters' => ['minimum_stock' => 5],
        ]);

        app(ProductImportService::class)->process($run);

        $report = $run->fresh()->report;
        $this->assertSame(105, $report['filtered_count']);
        $this->assertCount(100, $report['filtered_rows']);
        $this->assertSame(105, $run->fresh()->skipped_count);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Run Detail Tenant '.uniqid(),
            'email' => uniqid('run-detail').'@example.test',
            'is_active' => true,
        ]);
    }

    private function runForXml(Company $company, string $xml, array $options = []): ProductImportRun
    {
        Http::fake(['https://xml.example.test/run-detail.xml' => Http::response($xml, 200)]);

        $mapping = [
            'sku' => 'sku',
            'barcode' => 'barcode',
            'name' => 'name',
            'price' => 'price',
            'stock' => 'stock',
            'brand' => 'brand',
            'category' => 'category',
            'description' => 'description',
            'image_urls' => 'image_urls',
        ];

        $source = XmlSource::create([
            'company_id' => $company->id,
            'name' => 'XML Run Detail Feed',
            'supplier_name' => 'XML Supplier',
            'url' => 'https://xml.example.test/run-detail.xml',
            'field_mapping' => $mapping,
            'options' => $options,
            'is_active' => true,
        ]);

        return ProductImportRun::create([
            'company_id' => $company->id,
            'xml_source_id' => $source->id,
            'source_type' => 'xml',
            'supplier_name' => 'XML Supplier',
            'field_mapping' => $mapping,
            'options' => $this->importOptions($options),
            'status' => 'queued',
            'queued_at' => now(),
        ]);
    }

    private function importOptions(array $overrides = []): array
    {
        return array_replace_recursive([
            'match_by' => 'sku',
            'update_existing' => true,
            'deactivate_missing' => false,
            'update_stock_price_only' => false,
            'download_images' => false,
            'filters' => [
                'minimum_stock' => null,
                'minimum_price' => null,
                'include_categories' => [],
                'exclude_categories' => [],
                'exclude_brands' => [],
            ],
            'pricing' => [
                'source_profit_rate' => null,
                'price_multiplier' => null,
                'rounding_mode' => 'none',
            ],
            'transforms' => [
                'title_prefix' => '',
                'title_suffix' => '',
                'strip_html_description' => false,
            ],
            'stock_strategy' => [
                'missing_product_action' => 'none',
            ],
            'image_strategy' => [
                'download_images' => false,
                'max_image_count' => 8,
            ],
            'mappings' => [
                'categories' => [],
                'brands' => [],
            ],
            'mapping_behavior' => [
                'apply_category_mapping' => true,
                'apply_brand_mapping' => true,
            ],
        ], $overrides);
    }

    private function xml(array $rows): string
    {
        $items = collect($rows)->map(function (array $row) {
            $row += [
                'sku' => uniqid('SKU-'),
                'barcode' => uniqid('869'),
                'name' => 'Import Product',
                'price' => 100,
                'stock' => 5,
                'brand' => 'Acme',
                'category' => 'Default',
                'description' => 'Description',
                'image_urls' => '',
            ];

            return '<product>'
                .'<sku>'.htmlspecialchars((string) $row['sku'], ENT_XML1).'</sku>'
                .'<barcode>'.htmlspecialchars((string) $row['barcode'], ENT_XML1).'</barcode>'
                .'<name>'.htmlspecialchars((string) $row['name'], ENT_XML1).'</name>'
                .'<price>'.htmlspecialchars((string) $row['price'], ENT_XML1).'</price>'
                .'<stock>'.htmlspecialchars((string) $row['stock'], ENT_XML1).'</stock>'
                .'<brand>'.htmlspecialchars((string) $row['brand'], ENT_XML1).'</brand>'
                .'<category>'.htmlspecialchars((string) $row['category'], ENT_XML1).'</category>'
                .'<description>'.htmlspecialchars((string) $row['description'], ENT_XML1).'</description>'
                .'<image_urls>'.htmlspecialchars((string) $row['image_urls'], ENT_XML1).'</image_urls>'
                .'</product>';
        })->implode('');

        return '<feed><products>'.$items.'</products></feed>';
    }
}
