<?php

namespace Tests\Feature;

use App\Models\CategoryMapping;
use App\Models\Company;
use App\Models\MarketplaceAttributeMapping;
use App\Models\MarketplaceBrandMapping;
use App\Models\MarketplaceCategoryMapping;
use App\Models\MarketplaceVariantAttributeMapping;
use App\Models\Product;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MarketplaceMappingCenterTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Tenant A', 'email' => 'tenant-a@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
    }

    public function test_marketplace_mapping_endpoints_require_marketplace_permission(): void
    {
        $support = User::factory()->create(['company_id' => $this->company->id]);
        $support->assignRole('support');
        Sanctum::actingAs($support);

        $this->getJson('/api/marketplace-mappings/summary')->assertForbidden();
    }

    public function test_tenant_user_lists_only_own_marketplace_mappings(): void
    {
        $other = Company::create(['name' => 'Tenant B', 'email' => 'tenant-b@example.test', 'is_active' => true]);

        MarketplaceCategoryMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Ayakkabi',
            'marketplace_category_id' => '100',
            'marketplace_category_name' => 'Spor Ayakkabi',
        ]);
        MarketplaceCategoryMapping::create([
            'company_id' => $other->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Gizli',
            'marketplace_category_id' => '200',
            'marketplace_category_name' => 'Gizli Kategori',
        ]);

        $this->getJson('/api/marketplace-mappings/categories?marketplace_code=trendyol')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.local_category_name', 'Ayakkabi');
    }

    public function test_category_brand_attribute_and_variant_crud_work(): void
    {
        $category = $this->postJson('/api/marketplace-mappings/categories', [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Ayakkabi',
            'marketplace_category_id' => '100',
            'marketplace_category_name' => 'Spor Ayakkabi',
            'marketplace_category_path' => 'Giyim > Ayakkabi',
            'confidence' => 'manual',
        ])->assertCreated()->assertJsonPath('local_category_name', 'Ayakkabi')->json();

        $this->putJson("/api/marketplace-mappings/categories/{$category['id']}", [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Ayakkabi',
            'marketplace_category_id' => '101',
            'marketplace_category_name' => 'Sneaker',
            'status' => 'active',
        ])->assertOk()->assertJsonPath('marketplace_category_id', '101');

        $brand = $this->postJson('/api/marketplace-mappings/brands', [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_brand_name' => 'Demo Marka',
            'marketplace_brand_id' => '77',
            'marketplace_brand_name' => 'Demo Marka',
            'confidence' => 'exact',
        ])->assertCreated()->assertJsonPath('marketplace_brand_id', '77')->json();

        $attribute = $this->postJson('/api/marketplace-mappings/attributes', [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'marketplace_category_id' => '101',
            'marketplace_attribute_id' => '338',
            'marketplace_attribute_name' => 'Renk',
            'required' => true,
            'source_type' => 'product_field',
            'source_field' => 'brand',
            'value_map' => ['Siyah' => 'Black'],
        ])->assertCreated()->assertJsonPath('required', true)->json();

        $variant = $this->postJson('/api/marketplace-mappings/variants', [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'variant_key' => 'renk',
            'marketplace_attribute_id' => '338',
            'marketplace_attribute_name' => 'Renk',
            'source_field' => 'renk',
            'value_map' => ['Kirmizi' => 'Red'],
        ])->assertCreated()->assertJsonPath('variant_key', 'renk')->json();

        $this->getJson('/api/marketplace-mappings/summary?marketplace_code=trendyol')
            ->assertOk()
            ->assertJsonPath('category_mapping_count', 1)
            ->assertJsonPath('brand_mapping_count', 1)
            ->assertJsonPath('attribute_mapping_count', 1)
            ->assertJsonPath('variant_mapping_count', 1);

        $this->deleteJson("/api/marketplace-mappings/variants/{$variant['id']}")->assertNoContent();
        $this->deleteJson("/api/marketplace-mappings/attributes/{$attribute['id']}")->assertNoContent();
        $this->deleteJson("/api/marketplace-mappings/brands/{$brand['id']}")->assertNoContent();
    }

    public function test_readiness_preview_reports_missing_mapping_reasons_without_publish_send(): void
    {
        Product::create([
            'company_id' => $this->company->id,
            'sku' => 'SKU-1',
            'barcode' => '869000000001',
            'name' => 'Eksik Urun',
            'brand' => 'Eslesmeyen Marka',
            'category' => 'Eslesmeyen Kategori',
            'price' => 100,
            'stock' => 1,
            'vat_rate' => 20,
            'status' => 'active',
        ]);

        MarketplaceBrandMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_brand_name' => 'Baska Marka',
            'marketplace_brand_id' => '55',
            'marketplace_brand_name' => 'Baska Marka',
        ]);
        MarketplaceAttributeMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'marketplace_attribute_id' => '338',
            'marketplace_attribute_name' => 'Renk',
            'required' => true,
            'source_type' => 'product_field',
            'source_field' => 'trendyol_brand_id',
        ]);

        $this->getJson('/api/marketplace-mappings/readiness-preview?marketplace_code=trendyol')
            ->assertOk()
            ->assertJsonPath('data.0.readiness_status', 'blocked')
            ->assertJsonPath('data.0.missing_category_mapping', true)
            ->assertJsonPath('data.0.missing_brand_mapping', true)
            ->assertJsonPath('data.0.missing_required_attributes.0', 'Renk');
    }

    public function test_legacy_category_mapping_endpoint_still_works(): void
    {
        $mapping = $this->postJson('/api/category-mappings', [
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category' => 'Legacy Kategori',
            'external_category_id' => '900',
            'external_category_name' => 'Legacy Trendyol',
            'attributes' => ['color' => 'Renk'],
        ])->assertCreated()->assertJsonPath('local_category', 'Legacy Kategori')->json();

        $this->getJson('/api/category-mappings?marketplace_code=trendyol')
            ->assertOk()
            ->assertJsonPath('data.0.id', $mapping['id']);

        $this->assertDatabaseHas('category_mappings', [
            'company_id' => $this->company->id,
            'local_category' => 'Legacy Kategori',
        ]);
    }
}
