<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrderOperation;
use App\Models\Order;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TrendyolInvoiceOpsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Invoice Ops Firma', 'email' => 'invoice-ops@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
        $this->setLiveInvoiceOpsFlag(false);
    }

    protected function tearDown(): void
    {
        $this->setLiveInvoiceOpsFlag(false);

        parent::tearDown();
    }

    public function test_send_invoice_link_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => 'https://example.invalid/masked-invoice.pdf',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_invoice_ops_disabled');

        Http::assertNothingSent();
        $operation = MarketplaceOrderOperation::firstOrFail();
        $this->assertSame('[masked]', $operation->request_payload['invoiceLink']);
    }

    public function test_send_invoice_link_rejects_invalid_url(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => 'not-a-url',
        ])->assertUnprocessable();
    }

    public function test_send_invoice_link_success_with_fake_provider_is_logged(): void
    {
        $this->setLiveInvoiceOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake(['*' => Http::response($this->fixture('send_invoice_link_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => 'https://example.invalid/masked-invoice.pdf',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'success');

        $this->assertDatabaseHas('orders', ['id' => $order->id, 'invoice_status' => 'sent']);
        $this->assertDatabaseHas('marketplace_order_operations', [
            'marketplace_account_id' => $account->id,
            'order_id' => $order->id,
            'operation_type' => 'invoice_link_send',
            'status' => 'success',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/shipment-packages/PKG-INVOICE/invoice-link'));
    }

    public function test_send_invoice_link_provider_error_is_logged(): void
    {
        $this->setLiveInvoiceOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake(['*' => Http::response($this->fixture('send_invoice_link_error.json'), 409)]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => 'https://example.invalid/masked-invoice.pdf',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'failed')
            ->assertJsonPath('operation.error_code', 'INVOICE_LINK_CONFLICT');

        $this->assertDatabaseMissing('orders', ['id' => $order->id, 'invoice_status' => 'sent']);
    }

    public function test_delete_invoice_link_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->deleteJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link")
            ->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_invoice_ops_disabled');

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_order_operations', [
            'operation_type' => 'invoice_link_delete',
            'status' => 'blocked',
        ]);
    }

    public function test_delete_invoice_link_success_and_error_are_normalized(): void
    {
        $this->setLiveInvoiceOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        $error = $this->fixture('delete_invoice_link_error.json');
        Http::fakeSequence()
            ->push($this->fixture('delete_invoice_link_success.json'))
            ->push($error, 404)
            ->push($error, 404)
            ->push($error, 404)
            ->push($error, 404);

        $this->deleteJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link")
            ->assertCreated()
            ->assertJsonPath('operation.status', 'success');

        $this->deleteJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link")
            ->assertCreated()
            ->assertJsonPath('operation.status', 'failed')
            ->assertJsonPath('operation.error_code', 'INVOICE_LINK_NOT_FOUND');

        Http::assertSent(fn ($request) => $request->method() === 'DELETE'
            && str_contains($request->url(), '/shipment-packages/PKG-INVOICE/invoice-link'));
    }

    public function test_upload_invoice_file_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-file", [
            'fileName' => 'masked-invoice.pdf',
            'fileContent' => base64_encode('fake pdf placeholder'),
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_invoice_ops_disabled');

        Http::assertNothingSent();
        $operation = MarketplaceOrderOperation::firstOrFail();
        $this->assertSame('[masked]', $operation->request_payload['fileContent']);
    }

    public function test_upload_invoice_file_success_and_error_are_normalized(): void
    {
        $this->setLiveInvoiceOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        $error = $this->fixture('upload_invoice_file_error.json');
        Http::fakeSequence()
            ->push($this->fixture('upload_invoice_file_success.json'))
            ->push($error, 415)
            ->push($error, 415)
            ->push($error, 415)
            ->push($error, 415);

        $payload = ['fileName' => 'masked-invoice.pdf', 'fileContent' => base64_encode('fake pdf placeholder')];
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-file", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'success');

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-file", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'failed')
            ->assertJsonPath('operation.error_code', 'INVOICE_FILE_INVALID');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/shipment-packages/PKG-INVOICE/invoice-file'));
    }

    public function test_invoice_operations_are_account_isolated(): void
    {
        $account = $this->trendyolAccount(['name' => 'Magaza A']);
        $other = $this->trendyolAccount(['name' => 'Magaza B']);
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$other->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => 'https://example.invalid/masked-invoice.pdf',
        ])->assertForbidden();
    }

    public function test_invoice_fixtures_and_logs_do_not_leak_secrets_or_invoice_content(): void
    {
        foreach ([
            'send_invoice_link_success.json',
            'send_invoice_link_error.json',
            'delete_invoice_link_success.json',
            'delete_invoice_link_error.json',
            'upload_invoice_file_success.json',
            'upload_invoice_file_error.json',
        ] as $file) {
            $content = file_get_contents($this->trendYolFixturePath($file));
            $this->assertJson($content);
            $this->assertStringNotContainsString('Author'.'ization', $content);
            $this->assertStringNotContainsString('Bearer ', $content);
            $this->assertStringNotContainsString('apiKey', $content);
            $this->assertStringNotContainsString('apiSecret', $content);
            $this->assertStringNotContainsString('supplierId', $content);
            $this->assertDoesNotMatchRegularExpression('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $content);
            $this->assertDoesNotMatchRegularExpression('/\+?\d[\d\s().-]{8,}\d/', $content);
        }

        $account = $this->trendyolAccount(['api_key' => 'api-key-secret-value', 'api_secret' => 'api-secret-value']);
        $order = $this->orderWithItem($account);
        $realishLink = 'https://example.invalid/customer-real-invoice.pdf';
        $fileContent = base64_encode('fake pdf placeholder with private content');

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-link", [
            'invoiceLink' => $realishLink,
        ])->assertCreated();
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/invoice-file", [
            'fileName' => 'masked-invoice.pdf',
            'fileContent' => $fileContent,
        ])->assertCreated();

        $serialized = json_encode(MarketplaceOrderOperation::query()->get()->toArray(), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('api-key-secret-value', $serialized);
        $this->assertStringNotContainsString('api-secret-value', $serialized);
        $this->assertStringNotContainsString($realishLink, $serialized);
        $this->assertStringNotContainsString($fileContent, $serialized);
        $this->assertStringNotContainsString('private content', $serialized);
    }

    private function trendYolFixturePath(string $file): string
    {
        return base_path("tests/Fixtures/trendyol/{$file}");
    }

    private function fixture(string $file): array
    {
        return json_decode(file_get_contents($this->trendYolFixturePath($file)), true);
    }

    private function trendyolAccount(array $overrides = []): MarketplaceAccount
    {
        return MarketplaceAccount::create(array_merge([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol Invoice Test',
            'supplier_id' => '12345',
            'api_key' => 'masked-api-key',
            'api_secret' => 'masked-api-secret',
            'is_active' => true,
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
            'metadata' => ['environment' => 'stage'],
        ], $overrides));
    }

    private function orderWithItem(MarketplaceAccount $account): Order
    {
        $order = Order::create([
            'company_id' => $account->company_id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'marketplace_order_id' => 'TY-INVOICE-ORDER',
            'provider_shipment_package_id' => 'PKG-INVOICE',
            'provider_package_status' => 'Invoiced',
            'provider_status' => 'Invoiced',
            'customer_name' => 'Masked Customer',
            'total_amount' => 100,
            'status' => 'new',
            'payload' => [],
        ]);
        $order->items()->create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'provider_line_id' => 'LINE-INVOICE-1',
            'barcode' => '869000000997',
            'sku' => 'TY-SKU-997',
            'name' => 'Masked Item',
            'quantity' => 1,
            'provider_status' => 'Created',
        ]);

        return $order->fresh(['items']);
    }

    private function setLiveInvoiceOpsFlag(bool $enabled): void
    {
        $value = $enabled ? 'true' : 'false';
        putenv("TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED={$value}");
        $_ENV['TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED'] = $value;
        $_SERVER['TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED'] = $value;
        config(['marketplaces.trendyol.live_invoice_ops_confirmed' => $value]);
    }
}
