<?php

namespace Tests\Feature;

use App\Jobs\Imports\ProcessProductImportJob;
use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use App\Models\XmlSource;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ProductImportPreviewSimulationTest extends TestCase
{
    use RefreshDatabase;

    public function test_preview_simulates_mapping_filter_price_transform_and_readiness(): void
    {
        $company = $this->company();
        $source = $this->source($company, $this->xml([
            [
                'sku' => 'SIM-1',
                'name' => 'Base Product',
                'price' => 100,
                'stock' => 7,
                'brand' => 'XML Brand',
                'category' => 'XML Shoes',
                'description' => '<p>Rich text</p>',
                'image_urls' => '',
            ],
            [
                'sku' => 'LOW-STOCK',
                'price' => 50,
                'stock' => 1,
                'brand' => 'XML Brand',
                'category' => 'XML Shoes',
            ],
        ]));
        $this->actingAsCompanyUser($company);

        $response = $this->postJson("/api/xml-sources/{$source->id}/preview", [
            'field_mapping' => $this->mapping(),
            'options' => [
                'filters' => ['minimum_stock' => 5],
                'pricing' => ['price_multiplier' => 1.5],
                'transforms' => [
                    'title_prefix' => 'PRE',
                    'title_suffix' => 'SUF',
                    'strip_html_description' => true,
                ],
                'mappings' => [
                    'categories' => ['XML Shoes' => 'Ayakkabi'],
                    'brands' => ['XML Brand' => 'Canonical Brand'],
                ],
            ],
        ])->assertOk();

        $response
            ->assertJsonPath('simulation_summary.total_previewed', 2)
            ->assertJsonPath('simulation_summary.importable_count', 1)
            ->assertJsonPath('simulation_summary.filtered_count', 1)
            ->assertJsonPath('simulation_summary.mapped_count', 2)
            ->assertJsonPath('simulation_summary.price_changed_count', 2)
            ->assertJsonPath('filtered_rows.0.reason', 'min_stock')
            ->assertJsonPath('mapped_rows.0.category_before', 'XML Shoes')
            ->assertJsonPath('mapped_rows.0.category_after', 'Ayakkabi')
            ->assertJsonPath('mapped_rows.0.brand_after', 'Canonical Brand')
            ->assertJsonPath('price_changed_rows.0.price_before', 100)
            ->assertJsonPath('price_changed_rows.0.price_after', 150)
            ->assertJsonPath('simulation_rows.0.mapped.name', 'PRE Base Product SUF')
            ->assertJsonPath('simulation_rows.0.mapped.description', 'Rich text')
            ->assertJsonPath('readiness_rows.0.missing_fields.0', 'image_urls');
    }

    public function test_preview_simulates_stock_strategy_without_writing_or_dispatching(): void
    {
        Queue::fake();
        $company = $this->company();
        Product::create([
            'company_id' => $company->id,
            'supplier_name' => 'XML Supplier',
            'sku' => 'OLD-SKU',
            'name' => 'Old Product',
            'price' => 100,
            'stock' => 8,
            'status' => 'active',
        ]);
        $source = $this->source($company, $this->xml([
            ['sku' => 'NEW-SKU'],
        ]));
        $this->actingAsCompanyUser($company);

        $this->postJson("/api/xml-sources/{$source->id}/preview", [
            'field_mapping' => $this->mapping(),
            'options' => [
                'stock_strategy' => ['missing_product_action' => 'zero_stock_missing'],
            ],
        ])
            ->assertOk()
            ->assertJsonPath('stock_strategy_preview.strategy', 'zero_stock_missing')
            ->assertJsonPath('stock_strategy_preview.affected_count', 1)
            ->assertJsonPath('stock_strategy_preview.affected_products.0.sku', 'OLD-SKU')
            ->assertJsonPath('stock_strategy_preview.affected_products.0.new_stock', 0);

        $this->assertSame(8, Product::where('sku', 'OLD-SKU')->value('stock'));
        $this->assertSame('active', Product::where('sku', 'OLD-SKU')->value('status'));
        $this->assertDatabaseCount('product_import_runs', 0);
        Queue::assertNotPushed(ProcessProductImportJob::class);
    }

    private function actingAsCompanyUser(Company $company): void
    {
        Sanctum::actingAs(User::factory()->create(['company_id' => $company->id]));
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Preview Tenant '.uniqid(),
            'email' => uniqid('preview').'@example.test',
            'is_active' => true,
        ]);
    }

    private function source(Company $company, string $xml): XmlSource
    {
        Http::fake(['https://xml.example.test/preview.xml' => Http::response($xml, 200)]);

        return XmlSource::create([
            'company_id' => $company->id,
            'name' => 'XML Preview Feed',
            'supplier_name' => 'XML Supplier',
            'url' => 'https://xml.example.test/preview.xml',
            'field_mapping' => $this->mapping(),
            'options' => [],
            'is_active' => true,
        ]);
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
