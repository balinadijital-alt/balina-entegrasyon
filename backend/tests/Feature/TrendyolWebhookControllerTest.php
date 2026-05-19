<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrendyolWebhookControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_public_route_rejects_invalid_signature_without_creating_order(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $account = $this->trendyolAccount($company);
        $payload = $this->payload($account->supplier_id);

        $this->postWebhook($payload, 'invalid-signature')
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Webhook signature gecersiz.');

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('inbound_webhook_deliveries', [
            'company_id' => $company->id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'status' => 'invalid_signature',
            'signature_valid' => false,
        ]);
    }

    public function test_valid_signature_processes_package_for_resolved_supplier(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $account = $this->trendyolAccount($company);
        $payload = $this->payload($account->supplier_id, orderNumber: 'TY-ORDER-1', packageNumber: 'PKG-1');

        $this->postSignedWebhook($payload)
            ->assertAccepted()
            ->assertJsonPath('result.count', 1);

        $this->assertDatabaseHas('orders', [
            'company_id' => $company->id,
            'marketplace_code' => 'trendyol',
            'marketplace_order_id' => 'TY-ORDER-1',
            'customer_name' => 'Ayse Yilmaz',
            'status' => 'new',
        ]);
        $this->assertDatabaseHas('inbound_webhook_deliveries', [
            'company_id' => $company->id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'status' => 'processed',
            'signature_valid' => true,
        ]);
    }

    public function test_unknown_supplier_is_logged_without_processing_order(): void
    {
        $payload = $this->payload('UNKNOWN-SUPPLIER');

        $this->postWebhook($payload, 'sha256='.str_repeat('a', 64))
            ->assertAccepted()
            ->assertJsonPath('message', 'Webhook alindi.');

        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseHas('inbound_webhook_deliveries', [
            'company_id' => null,
            'marketplace_account_id' => null,
            'marketplace_code' => 'trendyol',
            'status' => 'unknown_account',
            'signature_valid' => false,
        ]);
    }

    public function test_replayed_delivery_is_marked_duplicate_without_reprocessing(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $account = $this->trendyolAccount($company);
        $payload = $this->payload($account->supplier_id, orderNumber: 'TY-ORDER-REPLAY', packageNumber: 'PKG-REPLAY');

        $this->postSignedWebhook($payload)->assertAccepted();
        $this->postSignedWebhook($payload)
            ->assertOk()
            ->assertJsonPath('duplicate', true);

        $this->assertDatabaseCount('orders', 1);
        $this->assertDatabaseCount('inbound_webhook_deliveries', 1);
        $this->assertDatabaseHas('inbound_webhook_deliveries', [
            'company_id' => $company->id,
            'marketplace_account_id' => $account->id,
            'status' => 'duplicate',
        ]);
    }

    public function test_tenant_isolation_uses_resolved_account_company(): void
    {
        $ownCompany = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test', 'is_active' => true]);
        $ownAccount = $this->trendyolAccount($ownCompany, '111111');
        $this->trendyolAccount($otherCompany, '222222');

        $payload = $this->payload($ownAccount->supplier_id, orderNumber: 'TY-TENANT-1', packageNumber: 'PKG-TENANT-1');

        $this->postSignedWebhook($payload)->assertAccepted();

        $this->assertDatabaseHas('orders', [
            'company_id' => $ownCompany->id,
            'marketplace_order_id' => 'TY-TENANT-1',
        ]);
        $this->assertDatabaseMissing('orders', [
            'company_id' => $otherCompany->id,
            'marketplace_order_id' => 'TY-TENANT-1',
        ]);
    }

    public function test_delivery_payload_is_masked_recursively(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $account = $this->trendyolAccount($company);
        $payload = $this->payload($account->supplier_id);
        $payload['packages'][0]['token'] = 'plain-token';
        $payload['packages'][0]['nested'] = [
            'signature' => 'plain-signature',
            'authorization' => 'Bearer secret',
        ];

        $this->postSignedWebhook($payload)->assertAccepted();

        $delivery = InboundWebhookDelivery::firstOrFail();

        $this->assertSame('******', data_get($delivery->payload, 'packages.0.token'));
        $this->assertSame('******', data_get($delivery->payload, 'packages.0.nested.signature'));
        $this->assertSame('******', data_get($delivery->payload, 'packages.0.nested.authorization'));
    }

    public function test_protected_legacy_route_still_requires_authentication(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $account = $this->trendyolAccount($company);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/webhook/packages", $this->payload($account->supplier_id))
            ->assertUnauthorized();
    }

    private function trendyolAccount(Company $company, string $supplierId = '123456'): MarketplaceAccount
    {
        return MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => $supplierId,
            'api_key' => 'api-key',
            'api_secret' => 'api-secret',
            'is_active' => true,
            'metadata' => ['webhook_secret' => 'webhook-secret'],
        ]);
    }

    private function payload(string $supplierId, string $orderNumber = 'TY-ORDER-1', string $packageNumber = 'PKG-1'): array
    {
        return [
            'packages' => [[
                'supplierId' => $supplierId,
                'orderNumber' => $orderNumber,
                'packageNumber' => $packageNumber,
                'customerFirstName' => 'Ayse',
                'customerLastName' => 'Yilmaz',
                'customerEmail' => 'ayse@example.test',
                'customerPhone' => '5551112233',
                'totalPrice' => 199.90,
                'status' => 'Created',
            ]],
        ];
    }

    private function postSignedWebhook(array $payload)
    {
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES);

        return $this->postWebhook($payload, 'sha256='.hash_hmac('sha256', $body, 'webhook-secret'));
    }

    private function postWebhook(array $payload, string $signature)
    {
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES);

        return $this->call('POST', '/api/webhooks/trendyol/packages', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SIGNATURE' => $signature,
        ], $body);
    }
}
