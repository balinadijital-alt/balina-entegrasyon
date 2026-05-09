<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Order;
use App\Models\Product;
use App\Models\SaasPlan;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
        $this->user->assignRole('admin');
        Sanctum::actingAs($this->user);
        $this->company = Company::create(['name' => 'Test Firma', 'email' => 'firma@example.test', 'is_active' => true]);
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
        $this->postJson('/api/companies', ['name' => 'Yeni Firma', 'email' => 'new@example.test', 'is_active' => true])
            ->assertCreated()
            ->assertJsonPath('name', 'Yeni Firma');

        $this->postJson('/api/products', [
            'company_id' => $this->company->id,
            'sku' => 'SKU-1',
            'name' => 'Urun',
            'price' => 100,
            'stock' => 5,
            'vat_rate' => 20,
            'status' => 'active',
        ])->assertCreated();

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

        $integration = $this->getJson('/api/accounting-integrations')->assertOk()->json('0');
        $account = $this->postJson('/api/accounting-accounts', [
            'company_id' => $this->company->id,
            'accounting_integration_id' => $integration['id'],
            'name' => 'Test Muhasebe',
        ])->assertCreated()->json();
        $this->postJson("/api/orders/{$order->id}/invoices", ['accounting_account_id' => $account['id'], 'type' => 'earchive'])->assertAccepted();

        $plan = SaasPlan::first();
        $this->postJson("/api/companies/{$this->company->id}/start-trial", ['saas_plan_id' => $plan->id])->assertCreated();
        $this->getJson("/api/companies/{$this->company->id}/saas-usage")->assertOk()->assertJsonStructure(['subscription', 'usage']);
    }
}
