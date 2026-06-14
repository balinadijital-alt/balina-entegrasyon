<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceCatalogAttribute;
use App\Models\MarketplaceCatalogAttributeValue;
use App\Models\MarketplaceCatalogBrand;
use App\Models\MarketplaceCatalogCategory;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MarketplaceCatalogCacheTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private MarketplaceAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Tenant A', 'email' => 'tenant-a@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $this->company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->account = MarketplaceAccount::create([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol Magaza',
            'supplier_id' => '12345',
            'api_key' => 'api-key',
            'api_secret' => 'api-secret',
            'is_active' => true,
            'connection_status' => 'connected',
        ]);
    }

    public function test_categories_sync_writes_cache_and_search_reads_cached_rows(): void
    {
        Http::fake([
            '*' => Http::response([
                'categories' => [[
                    'id' => 10,
                    'name' => 'Ev ve Yasam',
                    'subCategories' => [[
                        'id' => 11,
                        'name' => 'Kanvas Tablo',
                        'subCategories' => [],
                    ]],
                ]],
            ]),
        ]);

        $this->postJson('/api/marketplace-catalog/trendyol/categories/sync', [
            'marketplace_account_id' => $this->account->id,
        ])->assertOk()->assertJsonCount(2, 'data')->assertJsonPath('count', 2)->assertJsonStructure(['last_synced_at']);

        $this->assertDatabaseHas('marketplace_catalog_categories', [
            'marketplace_code' => 'trendyol',
            'external_id' => '11',
            'name' => 'Kanvas Tablo',
            'path' => 'Ev ve Yasam > Kanvas Tablo',
            'is_leaf' => true,
        ]);

        $this->getJson('/api/marketplace-catalog/trendyol/categories?search=Kanvas')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('count', 1)
            ->assertJsonPath('data.0.external_id', '11');
    }

    public function test_brands_sync_writes_cache(): void
    {
        Http::fake([
            '*' => Http::response([
                'brands' => [
                    ['id' => 501, 'name' => 'Balina Home'],
                    ['id' => 502, 'name' => 'Balina Home'],
                ],
            ]),
        ]);

        $this->postJson('/api/marketplace-catalog/trendyol/brands/sync', [
            'marketplace_account_id' => $this->account->id,
        ])->assertOk()->assertJsonCount(2, 'data');

        $this->assertSame(1, MarketplaceCatalogBrand::query()->where('normalized_name', 'balinahome')->count());
        $this->getJson('/api/marketplace-catalog/trendyol/brands?search=balina')
            ->assertOk()
            ->assertJsonPath('data.0.name', 'Balina Home');
    }

    public function test_attributes_and_values_sync_write_cache(): void
    {
        Http::fakeSequence()
            ->push([
                'categoryAttributes' => [[
                    'attribute' => ['id' => 338, 'name' => 'Renk', 'type' => 'single_select'],
                    'required' => true,
                    'allowCustom' => false,
                    'attributeValues' => [
                        ['id' => 1, 'name' => 'Siyah'],
                    ],
                ]],
            ])
            ->push([
                'content' => [
                    ['id' => 2, 'name' => 'Beyaz'],
                ],
            ]);

        $this->postJson('/api/marketplace-catalog/trendyol/categories/11/attributes/sync', [
            'marketplace_account_id' => $this->account->id,
        ])->assertOk()->assertJsonPath('data.0.name', 'Renk');

        $this->assertDatabaseHas('marketplace_catalog_attributes', [
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'external_id' => '338',
            'required' => true,
        ]);
        $this->assertDatabaseHas('marketplace_catalog_attribute_values', [
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'attribute_external_id' => '338',
            'external_id' => '1',
            'name' => 'Siyah',
        ]);

        $this->postJson('/api/marketplace-catalog/trendyol/categories/11/attributes/338/values/sync', [
            'marketplace_account_id' => $this->account->id,
        ])->assertOk()->assertJsonPath('data.0.name', 'Beyaz');

        $this->getJson('/api/marketplace-catalog/trendyol/categories/11/attributes')
            ->assertOk()
            ->assertJsonPath('data.0.external_id', '338');

        $this->getJson('/api/marketplace-catalog/trendyol/categories/11/attributes/338/values')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_sync_requires_manage_permission(): void
    {
        $support = User::factory()->create(['company_id' => $this->company->id]);
        $support->assignRole('support');
        Sanctum::actingAs($support);

        $this->postJson('/api/marketplace-catalog/trendyol/categories/sync', [
            'marketplace_account_id' => $this->account->id,
        ])->assertForbidden();
    }

    public function test_tenant_cannot_sync_with_another_tenant_account(): void
    {
        $other = Company::create(['name' => 'Tenant B', 'email' => 'tenant-b@example.test', 'is_active' => true]);
        $foreignAccount = MarketplaceAccount::create([
            'company_id' => $other->id,
            'code' => 'trendyol',
            'name' => 'Foreign Trendyol',
            'supplier_id' => '99999',
            'api_key' => 'api-key',
            'api_secret' => 'api-secret',
            'is_active' => true,
        ]);

        $this->postJson('/api/marketplace-catalog/trendyol/categories/sync', [
            'marketplace_account_id' => $foreignAccount->id,
        ])->assertForbidden();
    }

    public function test_mapping_center_can_read_cached_catalog_endpoints(): void
    {
        MarketplaceCatalogCategory::create([
            'marketplace_code' => 'trendyol',
            'external_id' => '11',
            'name' => 'Kanvas Tablo',
            'path' => 'Ev ve Yasam > Kanvas Tablo',
            'is_leaf' => true,
        ]);
        MarketplaceCatalogBrand::create([
            'marketplace_code' => 'trendyol',
            'external_id' => '501',
            'name' => 'Balina Home',
            'normalized_name' => 'balinahome',
        ]);
        MarketplaceCatalogAttribute::create([
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'external_id' => '338',
            'name' => 'Renk',
            'required' => true,
        ]);
        MarketplaceCatalogAttributeValue::create([
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'attribute_external_id' => '338',
            'external_id' => '1',
            'name' => 'Siyah',
        ]);

        $this->getJson('/api/marketplace-catalog/trendyol/categories')->assertOk()->assertJsonPath('data.0.external_id', '11');
        $this->getJson('/api/marketplace-catalog/trendyol/brands')->assertOk()->assertJsonPath('data.0.external_id', '501');
        $this->getJson('/api/marketplace-catalog/trendyol/categories/11/attributes')->assertOk()->assertJsonPath('data.0.external_id', '338');
        $this->getJson('/api/marketplace-catalog/trendyol/categories/11/attributes/338/values')->assertOk()->assertJsonPath('data.0.external_id', '1');
    }
}
