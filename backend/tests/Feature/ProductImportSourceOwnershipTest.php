<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\User;
use App\Models\XmlSource;
use App\Services\Imports\ProductImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductImportSourceOwnershipTest extends TestCase
{
    use RefreshDatabase;

    private array $fakeXmls = [];

    public function test_xml_import_sets_source_ownership_on_create(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/create.xml', $this->xml([
            ['sku' => 'SRC-CREATE', 'price' => 125],
        ]));

        app(ProductImportService::class)->process($this->importRun($source));

        $product = Product::where('sku', 'SRC-CREATE')->firstOrFail();
        $this->assertSame($source->id, $product->xml_source_id);
        $this->assertSame('SRC-CREATE', $product->source_product_code);
        $this->assertNotNull($product->last_xml_sync_at);
    }

    public function test_existing_product_from_same_source_is_updated(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/update.xml', $this->xml([
            ['sku' => 'SRC-UPDATE', 'price' => 180, 'stock' => 11],
        ]));
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $source->id,
            'source_product_code' => 'SRC-UPDATE',
            'supplier_name' => 'XML Supplier',
            'sku' => 'SRC-UPDATE',
            'name' => 'Old Name',
            'price' => 80,
            'stock' => 2,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($source));

        $product = Product::where('sku', 'SRC-UPDATE')->firstOrFail();
        $this->assertEquals(180.00, (float) $product->price);
        $this->assertSame(11, $product->stock);
        $this->assertSame($source->id, $product->xml_source_id);
        $this->assertSame(0, $this->latestRun()->report['conflict_count']);
    }

    public function test_existing_product_from_different_source_is_skipped_as_conflict(): void
    {
        $company = $this->company();
        $sourceA = $this->source($company, 'https://xml.example.test/source-a.xml', $this->xml([
            ['sku' => 'CONFLICT-SKU'],
        ]), 'XML Supplier');
        $sourceB = $this->source($company, 'https://xml.example.test/source-b.xml', $this->xml([
            ['sku' => 'CONFLICT-SKU', 'price' => 999, 'stock' => 99],
        ]), 'XML Supplier');
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceA->id,
            'source_product_code' => 'CONFLICT-SKU',
            'supplier_name' => 'XML Supplier',
            'sku' => 'CONFLICT-SKU',
            'name' => 'Owned Product',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($sourceB));

        $product = Product::where('sku', 'CONFLICT-SKU')->firstOrFail();
        $run = $this->latestRun();
        $this->assertEquals(100.00, (float) $product->price);
        $this->assertSame(5, $product->stock);
        $this->assertSame(1, $run->report['conflict_count']);
        $this->assertSame('CONFLICT-SKU', $run->report['conflict_rows'][0]['sku']);
        $this->assertSame($sourceA->id, $run->report['conflict_rows'][0]['existing_xml_source_id']);
        $this->assertSame($sourceB->id, $run->report['conflict_rows'][0]['current_xml_source_id']);
        $this->assertSame(1, $run->skipped_count);
    }

    public function test_existing_product_without_source_is_claimed_by_current_source(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/claim.xml', $this->xml([
            ['sku' => 'CLAIM-SKU', 'price' => 155],
        ]));
        Product::create([
            'company_id' => $company->id,
            'supplier_name' => 'XML Supplier',
            'sku' => 'CLAIM-SKU',
            'name' => 'Claim Me',
            'price' => 100,
            'stock' => 4,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($source));

        $product = Product::where('sku', 'CLAIM-SKU')->firstOrFail();
        $run = $this->latestRun();
        $this->assertSame($source->id, $product->xml_source_id);
        $this->assertSame('CLAIM-SKU', $product->source_product_code);
        $this->assertSame(1, $run->report['claimed_existing_count']);
        $this->assertSame('CLAIM-SKU', $run->report['claimed_existing_rows'][0]['sku']);
    }

    public function test_missing_strategy_only_affects_products_from_same_xml_source(): void
    {
        $company = $this->company();
        $sourceA = $this->source($company, 'https://xml.example.test/missing-a.xml', $this->xml([
            ['sku' => 'SEEN-A'],
        ]), 'Shared Supplier');
        $sourceB = $this->source($company, 'https://xml.example.test/missing-b.xml', $this->xml([
            ['sku' => 'SEEN-B'],
        ]), 'Shared Supplier');
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceA->id,
            'supplier_name' => 'Shared Supplier',
            'sku' => 'MISSING-A',
            'name' => 'Missing A',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceB->id,
            'supplier_name' => 'Shared Supplier',
            'sku' => 'MISSING-B',
            'name' => 'Missing B',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($sourceA, [
            'stock_strategy' => ['missing_product_action' => 'zero_stock_missing'],
        ]));

        $this->assertSame(0, Product::where('sku', 'MISSING-A')->value('stock'));
        $this->assertSame(12, Product::where('sku', 'MISSING-B')->value('stock'));
        $this->assertSame(1, $this->latestRun()->report['zero_stocked_count']);
    }

    public function test_same_supplier_products_from_different_xml_source_are_not_passivated(): void
    {
        $company = $this->company();
        $sourceA = $this->source($company, 'https://xml.example.test/passive-a.xml', $this->xml([
            ['sku' => 'SEEN-PASSIVE-A'],
        ]), 'Shared Supplier');
        $sourceB = $this->source($company, 'https://xml.example.test/passive-b.xml', $this->xml([
            ['sku' => 'SEEN-PASSIVE-B'],
        ]), 'Shared Supplier');
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceA->id,
            'supplier_name' => 'Shared Supplier',
            'sku' => 'PASSIVE-A',
            'name' => 'Passive A',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceB->id,
            'supplier_name' => 'Shared Supplier',
            'sku' => 'PASSIVE-B',
            'name' => 'Passive B',
            'price' => 100,
            'stock' => 12,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($sourceA, [
            'stock_strategy' => ['missing_product_action' => 'passive_missing'],
        ]));

        $this->assertSame('passive', Product::where('sku', 'PASSIVE-A')->value('status'));
        $this->assertSame('active', Product::where('sku', 'PASSIVE-B')->value('status'));
        $this->assertSame(1, $this->latestRun()->report['deactivated_count']);
    }

    public function test_preview_simulates_conflict_without_writing(): void
    {
        $company = $this->company();
        $sourceA = $this->source($company, 'https://xml.example.test/preview-a.xml', $this->xml([
            ['sku' => 'PREVIEW-CONFLICT'],
        ]));
        $sourceB = $this->source($company, 'https://xml.example.test/preview-b.xml', $this->xml([
            ['sku' => 'PREVIEW-CONFLICT', 'price' => 250],
        ]));
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceA->id,
            'source_product_code' => 'PREVIEW-CONFLICT',
            'supplier_name' => 'XML Supplier',
            'sku' => 'PREVIEW-CONFLICT',
            'name' => 'Preview Existing',
            'price' => 100,
            'stock' => 7,
            'status' => 'active',
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->postJson("/api/xml-sources/{$sourceB->id}/preview", [
            'field_mapping' => $this->mapping(),
        ])
            ->assertOk()
            ->assertJsonPath('simulation_summary.conflict_count', 1)
            ->assertJsonPath('simulation_rows.0.status', 'conflict')
            ->assertJsonPath('ownership_conflict_rows.0.sku', 'PREVIEW-CONFLICT')
            ->assertJsonPath('ownership_conflict_rows.0.existing_xml_source_id', $sourceA->id)
            ->assertJsonPath('ownership_conflict_rows.0.current_xml_source_id', $sourceB->id);

        $this->assertEquals(100.00, (float) Product::where('sku', 'PREVIEW-CONFLICT')->value('price'));
        $this->assertDatabaseCount('product_import_runs', 0);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Ownership Tenant '.uniqid(),
            'email' => uniqid('ownership').'@example.test',
            'is_active' => true,
        ]);
    }

    private function source(Company $company, string $url, string $xml, string $supplierName = 'XML Supplier'): XmlSource
    {
        $this->fakeXmls[$url] = Http::response($xml, 200);
        Http::fake($this->fakeXmls);

        return XmlSource::create([
            'company_id' => $company->id,
            'name' => 'XML Ownership Feed '.uniqid(),
            'supplier_name' => $supplierName,
            'url' => $url,
            'field_mapping' => $this->mapping(),
            'options' => [],
            'is_active' => true,
        ]);
    }

    private function importRun(XmlSource $source, array $options = []): ProductImportRun
    {
        return ProductImportRun::create([
            'company_id' => $source->company_id,
            'xml_source_id' => $source->id,
            'source_type' => 'xml',
            'supplier_name' => $source->supplier_name,
            'field_mapping' => $this->mapping(),
            'options' => $this->importOptions($options),
            'status' => 'queued',
            'queued_at' => now(),
        ]);
    }

    private function latestRun(): ProductImportRun
    {
        return ProductImportRun::latest('id')->firstOrFail()->fresh();
    }

    private function mapping(): array
    {
        return [
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
                'image_urls' => 'https://example.test/image.jpg',
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
