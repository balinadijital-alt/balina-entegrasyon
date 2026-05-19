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

class ProductImportAdvancedOptionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_filtered_rows_are_skipped_and_reported(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'LOW-STOCK', 'stock' => 1, 'price' => 100, 'category' => 'Shoes', 'brand' => 'Acme'],
            ['sku' => 'READY', 'stock' => 8, 'price' => 120, 'category' => 'Shoes', 'brand' => 'Acme'],
        ]), [
            'filters' => ['minimum_stock' => 5],
        ]);

        app(ProductImportService::class)->process($run);

        $run->refresh();
        $this->assertDatabaseMissing('products', ['sku' => 'LOW-STOCK']);
        $this->assertDatabaseHas('products', ['sku' => 'READY']);
        $this->assertSame(1, $run->report['filtered_count']);
        $this->assertSame(1, $run->skipped_count);
    }

    public function test_price_multiplier_is_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'MULTIPLIER', 'price' => 100],
        ]), [
            'pricing' => ['price_multiplier' => 1.5],
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertEquals(150.00, (float) Product::where('sku', 'MULTIPLIER')->value('price'));
    }

    public function test_profit_rate_is_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            ['sku' => 'PROFIT', 'price' => 100],
        ]), [
            'pricing' => ['source_profit_rate' => 20],
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertEquals(120.00, (float) Product::where('sku', 'PROFIT')->value('price'));
    }

    public function test_title_and_description_transforms_are_applied(): void
    {
        $run = $this->runForXml($this->company(), $this->xml([
            [
                'sku' => 'TRANSFORM',
                'name' => 'Base Product',
                'description' => '<p>Clean <strong>content</strong></p>',
            ],
        ], true), [
            'transforms' => [
                'title_prefix' => 'PRE',
                'title_suffix' => 'SUF',
                'strip_html_description' => true,
            ],
        ]);

        app(ProductImportService::class)->process($run);

        $product = Product::where('sku', 'TRANSFORM')->firstOrFail();
        $this->assertSame('PRE Base Product SUF', $product->name);
        $this->assertSame('Clean content', $product->description);
    }

    public function test_zero_stock_missing_strategy_updates_missing_products_without_passivating(): void
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

        $oldProduct = Product::where('sku', 'OLD-SKU')->firstOrFail();
        $this->assertSame(0, $oldProduct->stock);
        $this->assertSame('active', $oldProduct->status);
        $this->assertSame(1, $run->fresh()->report['zero_stocked_count']);
    }

    public function test_legacy_deactivate_missing_still_passivates_missing_products(): void
    {
        $company = $this->company();
        Product::create([
            'company_id' => $company->id,
            'supplier_name' => 'XML Supplier',
            'sku' => 'LEGACY-OLD',
            'name' => 'Legacy Old Product',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);

        $run = $this->runForXml($company, $this->xml([
            ['sku' => 'LEGACY-NEW'],
        ]), [
            'deactivate_missing' => true,
        ]);

        app(ProductImportService::class)->process($run);

        $this->assertSame('passive', Product::where('sku', 'LEGACY-OLD')->value('status'));
        $this->assertSame(1, $run->fresh()->report['deactivated_count']);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Import Tenant '.uniqid(),
            'email' => uniqid('import').'@example.test',
            'is_active' => true,
        ]);
    }

    private function runForXml(Company $company, string $xml, array $options = []): ProductImportRun
    {
        Http::fake(['https://xml.example.test/feed.xml' => Http::response($xml, 200)]);

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
            'name' => 'XML Feed',
            'supplier_name' => 'XML Supplier',
            'url' => 'https://xml.example.test/feed.xml',
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
        ], $overrides);
    }

    private function xml(array $rows, bool $cdataDescription = false): string
    {
        $items = collect($rows)->map(function (array $row) use ($cdataDescription) {
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

            $description = $cdataDescription
                ? '<description><![CDATA['.$row['description'].']]></description>'
                : '<description>'.htmlspecialchars((string) $row['description'], ENT_XML1).'</description>';

            return '<product>'
                .'<sku>'.htmlspecialchars((string) $row['sku'], ENT_XML1).'</sku>'
                .'<barcode>'.htmlspecialchars((string) $row['barcode'], ENT_XML1).'</barcode>'
                .'<name>'.htmlspecialchars((string) $row['name'], ENT_XML1).'</name>'
                .'<price>'.htmlspecialchars((string) $row['price'], ENT_XML1).'</price>'
                .'<stock>'.htmlspecialchars((string) $row['stock'], ENT_XML1).'</stock>'
                .'<brand>'.htmlspecialchars((string) $row['brand'], ENT_XML1).'</brand>'
                .'<category>'.htmlspecialchars((string) $row['category'], ENT_XML1).'</category>'
                .$description
                .'<image_urls>'.htmlspecialchars((string) $row['image_urls'], ENT_XML1).'</image_urls>'
                .'</product>';
        })->implode('');

        return '<feed><products>'.$items.'</products></feed>';
    }
}
