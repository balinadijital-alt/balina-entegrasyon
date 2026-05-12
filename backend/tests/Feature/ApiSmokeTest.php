<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\AuditLog;
use App\Models\CategoryMapping;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Product;
use App\Models\SaasPlan;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ApiSmokeTest extends TestCase
{
    use RefreshDatabase;

    protected User $user;
    protected Company $company;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
        $this->user = User::factory()->create();
        $this->user->assignRole('super_admin');
        Sanctum::actingAs($this->user);
        $this->company = Company::create(['name' => 'Test Firma', 'email' => 'firma@example.test', 'is_active' => true]);
    }

    public function test_company_user_cannot_access_other_company_records(): void
    {
        $ownCompany = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test', 'is_active' => true]);
        $tenantUser = User::factory()->create(['company_id' => $ownCompany->id]);
        $tenantUser->assignRole('company_admin');
        Sanctum::actingAs($tenantUser);

        Product::create([
            'company_id' => $ownCompany->id,
            'sku' => 'OWN-1',
            'name' => 'Kendi Urunu',
            'price' => 10,
            'stock' => 1,
            'vat_rate' => 20,
            'status' => 'active',
        ]);
        $otherProduct = Product::create([
            'company_id' => $otherCompany->id,
            'sku' => 'OTHER-1',
            'name' => 'Baska Firma Urunu',
            'price' => 10,
            'stock' => 1,
            'vat_rate' => 20,
            'status' => 'active',
        ]);
        Order::create([
            'company_id' => $otherCompany->id,
            'marketplace_code' => 'test',
            'marketplace_order_id' => 'OTHER-ORD',
            'customer_name' => 'Musteri',
            'total_amount' => 20,
            'status' => 'new',
        ]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/orders')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson("/api/products/{$otherProduct->id}")->assertForbidden();
        $this->getJson("/api/products?company_id={$otherCompany->id}")->assertForbidden();
    }

    public function test_auth_login_and_protected_me_endpoint(): void
    {
        $user = User::factory()->create(['email' => 'login@example.test', 'password' => 'password123']);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password123'])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);

        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('email', $this->user->email);
    }

    public function test_company_product_and_order_endpoints(): void
    {
        $this->getJson('/api/dashboard')
            ->assertOk()
            ->assertJsonStructure(['summary', 'charts', 'breakdowns', 'saas_usage', 'recent_activity']);

        $this->postJson('/api/companies', ['name' => 'Yeni Firma', 'email' => 'new@example.test', 'is_active' => true])
            ->assertCreated()
            ->assertJsonPath('name', 'Yeni Firma');

        $product = $this->postJson('/api/products', [
            'company_id' => $this->company->id,
            'sku' => 'SKU-1',
            'barcode' => '869000000001',
            'name' => 'Urun',
            'brand' => 'Demo Marka',
            'category' => 'Demo Kategori',
            'short_description' => 'Kisa aciklama',
            'description' => 'Detayli aciklama',
            'seo_title' => 'SEO Baslik',
            'seo_description' => 'SEO aciklama',
            'price' => 100,
            'stock' => 5,
            'vat_rate' => 20,
            'dimensional_weight' => 1,
            'shipping_type' => 'standard',
            'main_image_url' => 'https://example.test/image.jpg',
            'trendyol_category_id' => 123,
            'hepsiburada_category_id' => 'HB-123',
            'trendyol_attributes' => [['attributeId' => 1, 'attributeValueId' => 2]],
            'hepsiburada_attributes' => [['name' => 'Renk', 'value' => 'Siyah']],
            'attributes' => ['Renk' => 'Siyah', 'Beden' => 'M'],
            'tags' => ['Yeni Urun'],
            'unit' => 'adet',
            'status' => 'active',
        ])->assertCreated()->json();

        $marketplace = MarketplaceAccount::create([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Test Trendyol',
            'supplier_id' => '12345',
            'is_active' => true,
        ]);

        CategoryMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category' => 'Demo Kategori',
            'external_category_id' => '123',
            'external_category_name' => 'Demo Trendyol Kategori',
            'attributes' => ['brand' => 'Marka', 'color' => 'Renk'],
        ]);

        CategoryMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'hepsiburada',
            'local_category' => 'Demo Kategori',
            'external_category_id' => 'HB-123',
            'external_category_name' => 'Demo Hepsiburada Kategori',
            'attributes' => ['brand' => 'Marka', 'color' => 'Renk'],
        ]);

        $this->getJson("/api/products/{$product['id']}/readiness")
            ->assertOk()
            ->assertJsonPath('ready', true);

        $draft = $this->postJson('/api/marketplace-publish/validate', [
            'marketplace_account_id' => $marketplace->id,
            'product_ids' => [$product['id']],
        ])->assertCreated()->assertJsonPath('status', 'ready')->json();

        $this->postJson("/api/marketplace-publish-drafts/{$draft['id']}/send")
            ->assertOk()
            ->assertJsonPath('status', 'queued');

        Order::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'test',
            'marketplace_order_id' => 'ORD-1',
            'customer_name' => 'Musteri',
            'total_amount' => 100,
            'status' => 'new',
        ]);

        $this->getJson('/api/products')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/orders')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_catalog_resource_management_endpoints(): void
    {
        $category = $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'categories',
            'name' => 'Ayakkabi',
            'sort_order' => 1,
            'is_active' => true,
            'settings' => ['seo_title' => 'Ayakkabi'],
        ])->assertCreated()->assertJsonPath('name', 'Ayakkabi')->json();

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'parent_id' => $category['id'],
            'type' => 'categories',
            'name' => 'Spor Ayakkabi',
            'is_active' => true,
        ])->assertCreated()->assertJsonPath('parent_id', $category['id']);

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'brands',
            'name' => 'Demo Marka',
            'image_url' => 'https://example.test/logo.png',
            'settings' => ['seo_description' => 'Marka aciklamasi'],
        ])->assertCreated()->assertJsonPath('name', 'Demo Marka');

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'attributes',
            'name' => 'Renk',
            'values' => ['Siyah', 'Beyaz'],
        ])->assertCreated()->assertJsonPath('values.0', 'Siyah');

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'tags',
            'name' => 'Yeni Urun',
            'settings' => ['color' => '#2563eb', 'icon' => 'sparkles'],
        ])->assertCreated()->assertJsonPath('name', 'Yeni Urun');

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'suppliers',
            'name' => 'Demo Tedarikci',
            'settings' => ['xml_url' => 'https://example.test/feed.xml', 'discount_rate' => 10],
        ])->assertCreated()->assertJsonPath('name', 'Demo Tedarikci');

        $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'tax-rates',
            'name' => '%20 KDV',
            'code' => '20',
            'settings' => ['rate' => 20],
        ])->assertCreated()->assertJsonPath('code', '20');

        $unit = $this->postJson('/api/catalog-resources', [
            'company_id' => $this->company->id,
            'type' => 'units',
            'name' => 'Adet',
            'code' => 'adet',
        ])->assertCreated()->assertJsonPath('code', 'adet')->json();

        $this->putJson("/api/catalog-resources/{$unit['id']}", [
            'company_id' => $this->company->id,
            'type' => 'units',
            'name' => 'Paket',
            'code' => 'paket',
            'is_active' => true,
        ])->assertOk()->assertJsonPath('name', 'Paket');

        $this->getJson('/api/catalog-resources?type=categories')->assertOk()->assertJsonCount(2, 'data');
        $this->deleteJson("/api/catalog-resources/{$unit['id']}")->assertNoContent();
    }

    public function test_growth_module_crud_endpoints(): void
    {
        $this->postJson('/api/modules/cms-pages', [
            'title' => 'Hakkimizda',
            'slug' => 'hakkimizda',
            'status' => 'active',
            'content' => 'Demo icerik',
        ])->assertCreated()->assertJsonPath('title', 'Hakkimizda');

        $this->postJson('/api/modules/coupons', [
            'company_id' => $this->company->id,
            'name' => 'Sepet Indirimi',
            'code' => 'DEMO10',
            'type' => 'cart_discount',
            'value' => 10,
            'status' => 'active',
        ])->assertCreated()->assertJsonPath('code', 'DEMO10');

        $this->postJson('/api/modules/profit-rules', [
            'company_id' => $this->company->id,
            'scope' => 'marketplace',
            'scope_value' => 'trendyol',
            'profit_rate' => 20,
            'minimum_profit_amount' => 25,
            'costs' => ['commission' => 12, 'shipping' => 35],
        ])->assertCreated()->assertJsonPath('scope', 'marketplace');

        $this->postJson('/api/modules/price-calculations', [
            'company_id' => $this->company->id,
            'base_cost' => 100,
            'commission_cost' => 10,
            'tax_cost' => 20,
            'shipping_cost' => 15,
            'packaging_cost' => 5,
            'ad_cost' => 4,
            'profit_rate' => 30,
            'minimum_profit_amount' => 40,
        ])->assertCreated()->assertJsonPath('sale_price', 194);

        $this->postJson('/api/modules/dealers', [
            'company_id' => $this->company->id,
            'name' => 'Demo Bayi',
            'email' => 'bayi@example.test',
            'discount_rate' => 12,
            'balance' => 500,
        ])->assertCreated()->assertJsonPath('name', 'Demo Bayi');

        $this->postJson('/api/modules/seo-settings', [
            'title' => 'Ana Sayfa SEO',
            'scope' => 'home',
            'status' => 'active',
            'settings' => ['meta_description' => 'Balina demo'],
        ])->assertCreated()->assertJsonPath('scope', 'home');

        $this->getJson('/api/modules/cms-pages')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_specialized_domain_module_endpoints_and_audit_logs(): void
    {
        $page = $this->postJson('/api/cms/cms-pages', [
            'title' => 'KVKK',
            'slug' => 'kvkk',
            'status' => 'draft',
        ])->assertCreated()->json();

        $this->putJson("/api/cms/cms-pages/{$page['id']}", [
            'title' => 'KVKK Metni',
            'slug' => 'kvkk',
            'status' => 'active',
        ])->assertOk()->assertJsonPath('title', 'KVKK Metni');

        $this->postJson('/api/marketing/coupons', [
            'company_id' => $this->company->id,
            'name' => 'Kargo Bedava',
            'code' => 'KARGO0',
            'type' => 'free_shipping',
            'free_shipping' => true,
        ])->assertCreated()->assertJsonPath('free_shipping', true);

        $this->postJson('/api/pricing/profit-rules', [
            'company_id' => $this->company->id,
            'scope' => 'category',
            'scope_value' => 'Elektronik',
            'profit_rate' => 18,
        ])->assertCreated()->assertJsonPath('scope_value', 'Elektronik');

        $this->getJson('/api/cms/cms-pages')->assertOk()->assertJsonCount(1, 'data');
        $this->assertGreaterThanOrEqual(4, AuditLog::count());
    }

    public function test_payment_shipping_invoice_and_saas_endpoints(): void
    {
        $order = Order::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'test',
            'marketplace_order_id' => 'ORD-2',
            'customer_name' => 'Musteri',
            'customer_email' => 'musteri@example.test',
            'total_amount' => 250,
            'status' => 'new',
        ]);

        $paymentProvider = $this->getJson('/api/payment-providers')->assertOk()->json('0');
        $paymentAccount = $this->postJson('/api/payment-accounts', [
            'company_id' => $this->company->id,
            'payment_provider_id' => $paymentProvider['id'],
            'name' => 'Test POS',
        ])->assertCreated()->json();
        $this->postJson("/api/orders/{$order->id}/payments", ['payment_account_id' => $paymentAccount['id']])->assertCreated();

        $carrier = $this->getJson('/api/shipping-carriers')->assertOk()->json('0');
        $shippingAccount = $this->postJson('/api/shipping-accounts', [
            'company_id' => $this->company->id,
            'shipping_carrier_id' => $carrier['id'],
            'name' => 'Test Kargo',
        ])->assertCreated()->json();
        $this->postJson("/api/orders/{$order->id}/shipments", ['shipping_account_id' => $shippingAccount['id']])->assertAccepted();
        $this->postJson("/api/orders/{$order->id}/notes", ['note' => 'Depo kontrol etti.', 'type' => 'warehouse'])
            ->assertCreated()
            ->assertJsonPath('note', 'Depo kontrol etti.');
        $this->postJson("/api/orders/{$order->id}/transition", ['status' => 'preparing'])
            ->assertOk()
            ->assertJsonPath('status', 'preparing');

        $integration = $this->getJson('/api/accounting-integrations')->assertOk()->json('0');
        $account = $this->postJson('/api/accounting-accounts', [
            'company_id' => $this->company->id,
            'accounting_integration_id' => $integration['id'],
            'name' => 'Test Muhasebe',
        ])->assertCreated()->json();
        $this->postJson("/api/orders/{$order->id}/invoices", ['accounting_account_id' => $account['id'], 'type' => 'earchive'])->assertAccepted();
        $this->postJson('/api/orders/bulk', [
            'order_ids' => [$order->id],
            'action' => 'change_status',
            'status' => 'ready_to_ship',
        ])->assertOk()->assertJsonPath('processed', 1);
        $this->postJson("/api/orders/{$order->id}/resolution-request", ['type' => 'problem', 'reason' => 'Adres teyidi bekleniyor.'])
            ->assertOk()
            ->assertJsonPath('status', 'problematic');
        $this->getJson("/api/orders/{$order->id}")
            ->assertOk()
            ->assertJsonStructure(['notes', 'operation_histories', 'shipments', 'invoices', 'payments']);

        $plan = SaasPlan::first();
        $this->postJson("/api/companies/{$this->company->id}/start-trial", ['saas_plan_id' => $plan->id])->assertCreated();
        $this->getJson("/api/companies/{$this->company->id}/saas-usage")->assertOk()->assertJsonStructure(['subscription', 'usage']);
    }

    public function test_trendyol_authorization_environment_and_catalog_endpoints(): void
    {
        Http::fake(function ($request) {
            $this->assertStringStartsWith('https://stageapigw.trendyol.com', $request->url());
            $this->assertSame('12345 - BalinaEntegrasyon', $request->header('User-Agent')[0] ?? null);
            $this->assertStringStartsWith('Basic ', $request->header('Authorization')[0] ?? '');

            return Http::response(['brands' => [['id' => 1, 'name' => 'Demo Marka']]], 200);
        });

        $marketplace = MarketplaceAccount::create([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Stage Trendyol',
            'supplier_id' => '12345',
            'api_key' => 'api-key',
            'api_secret' => 'api-secret',
            'is_active' => true,
            'metadata' => ['environment' => 'stage'],
        ]);

        $this->getJson("/api/marketplaces/{$marketplace->id}/trendyol/brands")
            ->assertOk()
            ->assertJsonPath('brands.0.name', 'Demo Marka');
    }
}
