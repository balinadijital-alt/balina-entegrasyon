<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\User;
use App\Models\XmlSource;
use App\Services\Imports\ProductImportService;
use App\Services\Marketplaces\MarketplacePublishService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductVariantFoundationTest extends TestCase
{
    use RefreshDatabase;

    private array $fakeXmls = [];

    public function test_same_variant_group_creates_parent_and_children(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/variants.xml', $this->xml([
            ['sku' => 'VAR-RED-S', 'variant_group' => 'TEE-100', 'variants' => 'Renk:Kirmizi|Beden:S'],
            ['sku' => 'VAR-BLUE-M', 'variant_group' => 'TEE-100', 'variants' => 'Renk:Mavi|Beden:M'],
        ]));

        app(ProductImportService::class)->process($this->importRun($source));

        $parent = Product::where('product_type', 'parent')->where('variant_group_key', 'tee-100')->firstOrFail();
        $children = Product::where('parent_product_id', $parent->id)->orderBy('sku')->get();

        $this->assertSame(2, $children->count());
        $this->assertSame($source->id, $parent->xml_source_id);
        $this->assertSame($source->id, $children->first()->xml_source_id);
        $this->assertSame('variant', $children->first()->product_type);
        $this->assertSame('tee-100', $children->first()->variant_group_key);
        $this->assertSame(['Renk' => 'Mavi', 'Beden' => 'M'], $children->first()->variant_attributes);
        $this->assertSame(2, $this->latestRun()->report['variant_child_count']);
    }

    public function test_duplicate_parent_is_not_created_for_same_group_on_later_import(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/dupe-parent.xml', $this->xml([
            ['sku' => 'DUP-1', 'variant_group' => 'DUP-GROUP', 'variants' => 'Renk:Siyah'],
            ['sku' => 'DUP-2', 'variant_group' => 'DUP-GROUP', 'variants' => 'Renk:Beyaz'],
        ]));

        app(ProductImportService::class)->process($this->importRun($source));

        $this->assertSame(1, Product::where('product_type', 'parent')->where('variant_group_key', 'dup-group')->count());
        $this->assertSame(2, Product::where('variant_group_key', 'dup-group')->where('product_type', 'variant')->count());
    }

    public function test_ownership_conflict_is_preserved_for_variant_rows(): void
    {
        $company = $this->company();
        $sourceA = $this->source($company, 'https://xml.example.test/variant-a.xml', $this->xml([
            ['sku' => 'VAR-CONFLICT'],
        ]));
        $sourceB = $this->source($company, 'https://xml.example.test/variant-b.xml', $this->xml([
            ['sku' => 'VAR-CONFLICT', 'price' => 999, 'variant_group' => 'CONFLICT-GROUP', 'variants' => 'Renk:Siyah'],
        ]));
        Product::create([
            'company_id' => $company->id,
            'xml_source_id' => $sourceA->id,
            'source_product_code' => 'VAR-CONFLICT',
            'supplier_name' => 'XML Supplier',
            'sku' => 'VAR-CONFLICT',
            'name' => 'Owned Variant',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);

        app(ProductImportService::class)->process($this->importRun($sourceB));

        $run = $this->latestRun();
        $this->assertSame(1, $run->report['conflict_count']);
        $this->assertSame(0, $run->report['variant_child_count']);
        $this->assertSame(0, Product::where('xml_source_id', $sourceB->id)->where('variant_group_key', 'conflict-group')->count());
        $this->assertEquals(100.00, (float) Product::where('sku', 'VAR-CONFLICT')->value('price'));
    }

    public function test_simple_products_are_not_changed_to_variants(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/simple.xml', $this->xml([
            ['sku' => 'SIMPLE-1', 'variant_group' => '', 'variants' => ''],
        ]));

        app(ProductImportService::class)->process($this->importRun($source));

        $product = Product::where('sku', 'SIMPLE-1')->firstOrFail();
        $this->assertNull($product->parent_product_id);
        $this->assertNull($product->variant_group_key);
        $this->assertSame('standard', $product->product_type);
    }

    public function test_parent_products_are_excluded_from_publish_candidates(): void
    {
        $company = $this->company();
        $account = MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => '12345',
            'api_key' => 'key',
            'api_secret' => 'secret',
            'is_active' => true,
        ]);
        $parent = Product::create([
            'company_id' => $company->id,
            'sku' => 'PARENT-CANDIDATE',
            'name' => 'Parent Candidate',
            'product_type' => 'parent',
            'price' => 100,
            'stock' => 0,
            'status' => 'active',
        ]);
        $child = Product::create([
            'company_id' => $company->id,
            'parent_product_id' => $parent->id,
            'sku' => 'CHILD-CANDIDATE',
            'barcode' => '8690000000001',
            'name' => 'Child Candidate',
            'product_type' => 'variant',
            'brand' => 'Acme',
            'category' => 'Shoes',
            'price' => 100,
            'stock' => 5,
            'vat_rate' => 20,
            'status' => 'active',
        ]);

        $draft = app(MarketplacePublishService::class)->createDraft($account, [$parent->id, $child->id], []);

        $this->assertSame([$child->id], $draft->product_ids);
    }

    public function test_product_detail_returns_parent_child_relationships(): void
    {
        $company = $this->company();
        $parent = Product::create([
            'company_id' => $company->id,
            'sku' => 'DETAIL-PARENT',
            'name' => 'Detail Parent',
            'product_type' => 'parent',
            'price' => 100,
            'stock' => 0,
            'status' => 'active',
        ]);
        $child = Product::create([
            'company_id' => $company->id,
            'parent_product_id' => $parent->id,
            'sku' => 'DETAIL-CHILD',
            'name' => 'Detail Child',
            'product_type' => 'variant',
            'variant_attributes' => ['Renk' => 'Kirmizi'],
            'price' => 110,
            'stock' => 4,
            'status' => 'active',
        ]);
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->getJson("/api/products/{$parent->id}")
            ->assertOk()
            ->assertJsonPath('variants.0.sku', $child->sku)
            ->assertJsonPath('variants.0.variant_attributes.Renk', 'Kirmizi');

        $this->getJson("/api/products/{$child->id}")
            ->assertOk()
            ->assertJsonPath('parent.sku', $parent->sku);
    }

    public function test_preview_simulates_variant_without_writing_parent_or_child(): void
    {
        $company = $this->company();
        $source = $this->source($company, 'https://xml.example.test/preview-variant.xml', $this->xml([
            ['sku' => 'PREVIEW-VAR', 'variant_group' => 'PV-GROUP', 'variants' => 'Renk:Yesil'],
        ]));
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));

        $this->postJson("/api/xml-sources/{$source->id}/preview", [
            'field_mapping' => $this->mapping(),
        ])
            ->assertOk()
            ->assertJsonPath('simulation_summary.variant_child_count', 1)
            ->assertJsonPath('variant_rows.0.variant_group_key', 'pv-group')
            ->assertJsonPath('variant_rows.0.parent_exists', false);

        $this->assertDatabaseMissing('products', ['sku' => 'PREVIEW-VAR']);
        $this->assertDatabaseCount('product_import_runs', 0);
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Variant Tenant '.uniqid(),
            'email' => uniqid('variant').'@example.test',
            'is_active' => true,
        ]);
    }

    private function source(Company $company, string $url, string $xml): XmlSource
    {
        $this->fakeXmls[$url] = Http::response($xml, 200);
        Http::fake($this->fakeXmls);

        return XmlSource::create([
            'company_id' => $company->id,
            'name' => 'XML Variant Feed '.uniqid(),
            'supplier_name' => 'XML Supplier',
            'url' => $url,
            'field_mapping' => $this->mapping(),
            'options' => [],
            'is_active' => true,
        ]);
    }

    private function importRun(XmlSource $source): ProductImportRun
    {
        return ProductImportRun::create([
            'company_id' => $source->company_id,
            'xml_source_id' => $source->id,
            'source_type' => 'xml',
            'supplier_name' => $source->supplier_name,
            'field_mapping' => $this->mapping(),
            'options' => $this->importOptions(),
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
            'variant_group' => 'variant_group',
            'variants' => 'variants',
        ];
    }

    private function importOptions(): array
    {
        return [
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
        ];
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
                'variant_group' => '',
                'variants' => '',
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
                .'<variant_group>'.htmlspecialchars((string) $row['variant_group'], ENT_XML1).'</variant_group>'
                .'<variants>'.htmlspecialchars((string) $row['variants'], ENT_XML1).'</variants>'
                .'</product>';
        })->implode('');

        return '<feed><products>'.$items.'</products></feed>';
    }
}
