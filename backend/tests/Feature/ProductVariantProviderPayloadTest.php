<?php

namespace Tests\Feature;

use App\Models\CategoryMapping;
use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Product;
use App\Services\Marketplaces\HepsiburadaService;
use App\Services\Marketplaces\MarketplacePublishService;
use App\Services\Marketplaces\TrendyolService;
use App\Services\Products\ProductReadinessService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use ReflectionMethod;
use Tests\TestCase;

class ProductVariantProviderPayloadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::preventStrayRequests();
    }

    public function test_trendyol_child_payload_uses_variant_group_and_child_commercial_fields(): void
    {
        [$parent, $child] = $this->variantProducts();

        $payload = $this->trendyolPayload($child->fresh(['parent.images', 'images']));

        $this->assertSame('shoe-family', $payload['productMainId']);
        $this->assertSame('869CHILD', $payload['barcode']);
        $this->assertSame('CHILD-SKU', $payload['stockCode']);
        $this->assertSame(7, $payload['quantity']);
        $this->assertSame(120.0, $payload['salePrice']);
        $this->assertSame(150.0, $payload['listPrice']);
        $this->assertSame($parent->trendyol_brand_id, $payload['brandId']);
        $this->assertSame($parent->trendyol_category_id, $payload['categoryId']);
        $this->assertSame($parent->description, $payload['description']);
        $this->assertSame([['url' => $parent->main_image_url]], $payload['images']);
    }

    public function test_hepsiburada_child_payload_uses_variant_group_and_child_commercial_fields(): void
    {
        [$parent, $child] = $this->variantProducts();
        $account = $this->marketplaceAccount($parent->company, 'hepsiburada');

        $payload = $this->hepsiburadaPayload($account, $child->fresh(['parent.images', 'images']));

        $this->assertSame('shoe-family', $payload['VaryantGroupID']);
        $this->assertSame('CHILD-SKU', $payload['merchantSku']);
        $this->assertSame('869CHILD', $payload['Barcode']);
        $this->assertSame('120,00', $payload['price']);
        $this->assertSame('7', $payload['stock']);
        $this->assertSame($parent->brand, $payload['Marka']);
        $this->assertSame($parent->description, $payload['UrunAciklamasi']);
        $this->assertSame($parent->main_image_url, $payload['Image1']);
        $this->assertSame((int) $parent->hepsiburada_category_id, $payload['categoryId']);
    }

    public function test_simple_product_payload_behavior_is_unchanged(): void
    {
        $company = $this->company();
        $product = Product::create([
            'company_id' => $company->id,
            'sku' => 'SIMPLE SKU',
            'barcode' => '869SIMPLE',
            'name' => 'Simple Product',
            'brand' => 'Simple Brand',
            'trendyol_brand_id' => 345,
            'category' => 'Simple Category',
            'trendyol_category_id' => 456,
            'hepsiburada_category_id' => '567',
            'description' => 'Simple Description',
            'main_image_url' => 'https://example.test/simple.jpg',
            'price' => 90,
            'list_price' => 100,
            'stock' => 3,
            'vat_rate' => 20,
            'status' => 'active',
            'trendyol_attributes' => ['renk' => 'siyah'],
            'hepsiburada_attributes' => ['beden' => '42'],
        ]);
        $account = $this->marketplaceAccount($company, 'hepsiburada');

        $trendyol = $this->trendyolPayload($product->fresh(['parent.images', 'images']));
        $hepsiburada = $this->hepsiburadaPayload($account, $product->fresh(['parent.images', 'images']));

        $this->assertSame('SIMPLE SKU', $trendyol['productMainId']);
        $this->assertSame('SIMPLE SKU', $trendyol['stockCode']);
        $this->assertSame('SIMPLESKU', $hepsiburada['VaryantGroupID']);
        $this->assertSame('SIMPLESKU', $hepsiburada['merchantSku']);
    }

    public function test_publish_draft_preview_excludes_parent_and_includes_child_group_id(): void
    {
        [$parent, $child] = $this->variantProducts();
        $account = $this->marketplaceAccount($parent->company, 'trendyol');

        $draft = app(MarketplacePublishService::class)->createDraft($account, [$parent->id, $child->id], []);

        $this->assertSame([$child->id], $draft->product_ids);
        $this->assertSame('shoe-family', $draft->payload_preview[$child->id]['variant_group_id']);
        $this->assertSame($parent->brand, $draft->payload_preview[$child->id]['brand']);
        $this->assertSame($parent->trendyol_category_id, $draft->payload_preview[$child->id]['category_id']);
    }

    public function test_child_readiness_uses_parent_fallback_fields(): void
    {
        [$parent, $child] = $this->variantProducts();
        $this->categoryMapping($parent->company, 'trendyol', $parent->category);
        $this->categoryMapping($parent->company, 'hepsiburada', $parent->category);

        $report = app(ProductReadinessService::class)->check($child->fresh(['parent.images', 'images']));

        $this->assertNotContains('category', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('brand', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('image', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('description', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('marketplace_category', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('required_attributes', $report['marketplaces']['trendyol']['missing_fields']);
        $this->assertNotContains('category', $report['marketplaces']['hepsiburada']['missing_fields']);
        $this->assertNotContains('brand', $report['marketplaces']['hepsiburada']['missing_fields']);
        $this->assertNotContains('image', $report['marketplaces']['hepsiburada']['missing_fields']);
        $this->assertNotContains('description', $report['marketplaces']['hepsiburada']['missing_fields']);
        $this->assertNotContains('marketplace_category', $report['marketplaces']['hepsiburada']['missing_fields']);
        $this->assertNotContains('required_attributes', $report['marketplaces']['hepsiburada']['missing_fields']);
    }

    private function trendyolPayload(Product $product): array
    {
        $method = new ReflectionMethod(TrendyolService::class, 'productPayload');
        $method->setAccessible(true);

        return $method->invoke(app(TrendyolService::class), $product);
    }

    private function hepsiburadaPayload(MarketplaceAccount $account, Product $product): array
    {
        $method = new ReflectionMethod(HepsiburadaService::class, 'productPayload');
        $method->setAccessible(true);

        return $method->invoke(app(HepsiburadaService::class), $account, $product);
    }

    private function variantProducts(): array
    {
        $company = $this->company();
        $parent = Product::create([
            'company_id' => $company->id,
            'sku' => 'PARENT-SKU',
            'name' => 'Parent Shoe',
            'product_type' => 'parent',
            'brand' => 'Parent Brand',
            'trendyol_brand_id' => 123,
            'category' => 'Shoes',
            'trendyol_category_id' => 456,
            'hepsiburada_category_id' => '789',
            'description' => 'Parent Description',
            'seo_title' => 'Parent SEO',
            'seo_description' => 'Parent SEO Description',
            'main_image_url' => 'https://example.test/parent.jpg',
            'shipping_type' => 'standard',
            'dimensional_weight' => 2,
            'price' => 100,
            'stock' => 0,
            'vat_rate' => 20,
            'status' => 'active',
            'attributes' => ['material' => 'leather'],
            'trendyol_attributes' => ['renk' => 'kirmizi'],
            'hepsiburada_attributes' => ['numara' => '42'],
        ]);
        $child = Product::create([
            'company_id' => $company->id,
            'parent_product_id' => $parent->id,
            'sku' => 'CHILD-SKU',
            'barcode' => '869CHILD',
            'name' => 'Child Shoe',
            'product_type' => 'variant',
            'variant_group_key' => 'shoe-family',
            'variant_attributes' => ['Renk' => 'Kirmizi', 'Numara' => '42'],
            'price' => 120,
            'list_price' => 150,
            'stock' => 7,
            'vat_rate' => 20,
            'status' => 'active',
        ]);

        return [$parent, $child];
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Variant Provider Tenant '.uniqid(),
            'email' => uniqid('variant-provider').'@example.test',
            'is_active' => true,
        ]);
    }

    private function marketplaceAccount(Company $company, string $code): MarketplaceAccount
    {
        return MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => $code,
            'name' => ucfirst($code),
            'supplier_id' => $code === 'trendyol' ? '12345' : null,
            'merchant_id' => $code === 'hepsiburada' ? 'MERCHANT' : null,
            'api_key' => 'key',
            'api_secret' => 'secret',
            'service_username' => 'user',
            'service_password' => 'pass',
            'is_active' => true,
        ]);
    }

    private function categoryMapping(Company $company, string $marketplace, string $category): CategoryMapping
    {
        return CategoryMapping::create([
            'company_id' => $company->id,
            'marketplace_code' => $marketplace,
            'local_category' => $category,
            'external_category_id' => '123',
            'external_category_name' => 'External Shoes',
            'attributes' => [],
        ]);
    }
}
