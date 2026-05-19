<?php

namespace Tests\Feature;

use App\Exceptions\MarketplaceApiException;
use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\Product;
use App\Services\Marketplaces\HepsiburadaService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class HepsiburadaEnvironmentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);

        config([
            'marketplaces.hepsiburada.base_url' => 'https://hb-prod-catalog.test',
            'marketplaces.hepsiburada.listing_base_url' => 'https://hb-prod-listing.test',
            'marketplaces.hepsiburada.order_base_url' => 'https://hb-prod-order.test',
            'marketplaces.hepsiburada.stage_base_url' => 'https://hb-stage-catalog.test',
            'marketplaces.hepsiburada.stage_listing_base_url' => 'https://hb-stage-listing.test',
            'marketplaces.hepsiburada.stage_order_base_url' => 'https://hb-stage-order.test',
        ]);
    }

    public function test_stage_metadata_uses_stage_catalog_url(): void
    {
        Http::fake(['https://hb-stage-catalog.test/*' => Http::response(['data' => []], 200)]);

        $result = app(HepsiburadaService::class)->testConnection($this->account('stage'));

        $this->assertSame('stage', $result['environment']);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://hb-stage-catalog.test/product/api/products/all-products-of-merchant/'));
    }

    public function test_production_metadata_uses_production_catalog_url(): void
    {
        Http::fake(['https://hb-prod-catalog.test/*' => Http::response(['data' => []], 200)]);

        $result = app(HepsiburadaService::class)->testConnection($this->account('production'));

        $this->assertSame('production', $result['environment']);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://hb-prod-catalog.test/product/api/products/all-products-of-merchant/'));
    }

    public function test_stage_metadata_uses_stage_listing_url(): void
    {
        Http::fake(['https://hb-stage-listing.test/*' => Http::response(['ok' => true], 200)]);

        $account = $this->account('stage');
        Product::create([
            'company_id' => $account->company_id,
            'sku' => 'HB-STAGE-1',
            'barcode' => '869000000001',
            'name' => 'HB Stage Product',
            'price' => 100,
            'stock' => 5,
            'status' => 'active',
        ]);

        $result = app(HepsiburadaService::class)->updatePriceAndInventory($account->fresh(['company.products']));

        $this->assertSame('stage', $result['environment']);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://hb-stage-listing.test/listings/merchantid/'));
    }

    public function test_stage_metadata_uses_stage_order_url(): void
    {
        Http::fake(['https://hb-stage-order.test/*' => Http::response(['items' => []], 200)]);

        $result = app(HepsiburadaService::class)->pullOrders($this->account('stage'));

        $this->assertSame('stage', $result['environment']);
        Http::assertSent(fn ($request) => str_starts_with($request->url(), 'https://hb-stage-order.test/packages/merchantid/'));
    }

    public function test_stage_url_missing_throws_without_falling_back_to_production(): void
    {
        config(['marketplaces.hepsiburada.stage_base_url' => null]);
        Http::fake();

        $this->expectException(MarketplaceApiException::class);
        $this->expectExceptionMessage('Hepsiburada test ortami URL ayarlari eksik');

        try {
            app(HepsiburadaService::class)->testConnection($this->account('stage'));
        } finally {
            Http::assertNothingSent();
        }
    }

    private function account(string $environment): MarketplaceAccount
    {
        $company = Company::create([
            'name' => 'HB Tenant '.uniqid(),
            'email' => uniqid('hb').'@example.test',
            'is_active' => true,
        ]);

        return MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'hepsiburada',
            'name' => 'Hepsiburada',
            'merchant_id' => 'merchant-123',
            'api_key' => 'username',
            'api_secret' => 'password',
            'service_username' => 'username',
            'service_password' => 'password',
            'is_active' => true,
            'metadata' => ['environment' => $environment],
        ]);
    }
}
