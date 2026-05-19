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

class ProductImportSourceMappingTest extends TestCase
{
    use RefreshDatabase;

    public function test_category_mapping_is_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'CAT-MAP', 'category' => 'XML Shoes'],
        ]), [
            'mappings' => [
                'categories' => ['XML Shoes' => 'Ayakkabi'],
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertSame('Ayakkabi', Product::where('sku', 'CAT-MAP')->value('category'));
        $this->assertSame(1, $run->fresh()->report['mapped_category_count']);
    }

    public function test_brand_mapping_is_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'BRAND-MAP', 'brand' => 'XML Brand'],
        ]), [
            'mappings' => [
                'brands' => ['XML Brand' => 'Canonical Brand'],
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertSame('Canonical Brand', Product::where('sku', 'BRAND-MAP')->value('brand'));
        $this->assertSame(1, $run->fresh()->report['mapped_brand_count']);
    }

    public function test_empty_mapping_preserves_raw_values(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'RAW-VALUES', 'category' => 'Raw Category', 'brand' => 'Raw Brand'],
        ]));

        app(ProductImportService::class)->process($run);

        $product = Product::where('sku', 'RAW-VALUES')->firstOrFail();
        $this->assertSame('Raw Category', $product->category);
        $this->assertSame('Raw Brand', $product->brand);
        $this->assertSame(0, $run->fresh()->report['mapped_category_count']);
        $this->assertSame(0, $run->fresh()->report['mapped_brand_count']);
    }

    public function test_normalized_exact_match_is_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'NORMALIZED', 'category' => '  Çocuk Ayakkabı  ', 'brand' => 'İthal Marka'],
        ]), [
            'mappings' => [
                'categories' => ['cocuk ayakkabi' => 'Cocuk Ayakkabi'],
                'brands' => ['ithal marka' => 'Ithal Marka'],
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $product = Product::where('sku', 'NORMALIZED')->firstOrFail();
        $this->assertSame('Cocuk Ayakkabi', $product->category);
        $this->assertSame('Ithal Marka', $product->brand);
    }

    public function test_filters_run_after_source_mapping(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'MAPPED-FILTER', 'category' => 'XML Shoes'],
            ['sku' => 'UNMAPPED-FILTER', 'category' => 'XML Bags'],
        ]), [
            'filters' => ['include_categories' => ['Ayakkabi']],
            'mappings' => [
                'categories' => ['XML Shoes' => 'Ayakkabi'],
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertDatabaseHas('products', ['sku' => 'MAPPED-FILTER', 'category' => 'Ayakkabi']);
        $this->assertDatabaseMissing('products', ['sku' => 'UNMAPPED-FILTER']);
        $run->refresh();
        $this->assertSame(1, $run->report['mapped_category_count']);
        $this->assertSame(1, $run->report['unmapped_category_count']);
        $this->assertSame(1, $run->report['filtered_count']);
    }

    public function test_mapping_behavior_can_be_disabled(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'DISABLED', 'category' => 'XML Shoes', 'brand' => 'XML Brand'],
        ]), [
            'mappings' => [
                'categories' => ['XML Shoes' => 'Ayakkabi'],
                'brands' => ['XML Brand' => 'Canonical Brand'],
            ],
            'mapping_behavior' => [
                'apply_category_mapping' => false,
                'apply_brand_mapping' => false,
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $product = Product::where('sku', 'DISABLED')->firstOrFail();
        $this->assertSame('XML Shoes', $product->category);
        $this->assertSame('XML Brand', $product->brand);
        $this->assertSame(0, $run->fresh()->report['mapped_category_count']);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Source Mapping Tenant '.uniqid(),
            'email' => uniqid('source-mapping').'@example.test',
            'is_active' => true,
        ]);
    }

    private function runForXml(Company $company, string $xml, array $options = []): ProductImportRun
    {
        Http::fake(['https://xml.example.test/source-mapping.xml' => Http::response($xml, 200)]);

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
            'name' => 'XML Source Mapping Feed',
            'supplier_name' => 'XML Supplier',
            'url' => 'https://xml.example.test/source-mapping.xml',
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
