<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class WebhookSecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_missing_timestamp_is_rejected(): void
    {
        $account = $this->account();
        $payload = $this->payload($account->supplier_id);

        $this->postWebhook($payload, includeTimestamp: false)
            ->assertUnauthorized()
            ->assertJsonPath('message', 'Webhook timestamp gecersiz.');

        $this->assertDatabaseHas('inbound_webhook_deliveries', ['status' => 'expired_signature']);
    }

    public function test_expired_timestamp_is_rejected(): void
    {
        $account = $this->account();
        $payload = $this->payload($account->supplier_id);

        $this->postWebhook($payload, timestamp: now()->subMinutes(10)->timestamp)
            ->assertUnauthorized();

        $this->assertDatabaseHas('inbound_webhook_deliveries', ['status' => 'expired_signature']);
    }

    public function test_invalid_json_is_rejected(): void
    {
        $this->call('POST', '/api/webhooks/trendyol/packages', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_TIMESTAMP' => (string) now()->timestamp,
            'HTTP_X_SIGNATURE' => 'sha256='.str_repeat('a', 64),
        ], '{invalid-json')->assertBadRequest();

        $this->assertDatabaseHas('inbound_webhook_deliveries', ['status' => 'invalid_json']);
    }

    public function test_payload_limit_is_rejected(): void
    {
        $body = json_encode(['payload' => str_repeat('x', 262145)]);

        $this->call('POST', '/api/webhooks/trendyol/packages', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_TIMESTAMP' => (string) now()->timestamp,
            'HTTP_X_SIGNATURE' => 'sha256='.hash_hmac('sha256', $body, 'webhook-secret'),
        ], $body)->assertStatus(413);

        $this->assertDatabaseHas('inbound_webhook_deliveries', ['status' => 'payload_too_large']);
    }

    public function test_content_type_must_be_json(): void
    {
        $this->call('POST', '/api/webhooks/trendyol/packages', [], [], [], [
            'CONTENT_TYPE' => 'text/plain',
            'HTTP_ACCEPT' => 'application/json',
        ], 'hello')->assertStatus(415);

        $this->assertDatabaseHas('inbound_webhook_deliveries', ['status' => 'invalid_content_type']);
    }

    public function test_business_event_replay_is_rejected_without_reprocessing(): void
    {
        $account = $this->account();
        $payload = $this->payload($account->supplier_id, 'TY-REPLAY', 'PKG-REPLAY');

        $this->postWebhook($payload)->assertAccepted();
        $payload['packages'][0]['status'] = 'Picking';

        $this->postWebhook($payload)
            ->assertOk()
            ->assertJsonPath('duplicate', true);

        $this->assertDatabaseCount('orders', 1);
        $this->assertSame('duplicate', InboundWebhookDelivery::firstOrFail()->status);
    }

    private function account(): MarketplaceAccount
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => uniqid('tenant').'@example.test', 'is_active' => true]);

        return MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => '123456',
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
                'totalPrice' => 199.90,
                'status' => 'Created',
            ]],
        ];
    }

    private function postWebhook(array $payload, bool $includeTimestamp = true, ?int $timestamp = null)
    {
        $body = json_encode($payload, JSON_UNESCAPED_SLASHES);
        $headers = [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_SIGNATURE' => 'sha256='.hash_hmac('sha256', $body, 'webhook-secret'),
        ];

        if ($includeTimestamp) {
            $headers['HTTP_X_TIMESTAMP'] = (string) ($timestamp ?? now()->timestamp);
        }

        return $this->call('POST', '/api/webhooks/trendyol/packages', [], [], [], $headers, $body);
    }
}
