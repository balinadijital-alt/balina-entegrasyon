<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\ApiLog;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrderOperation;
use App\Models\Order;
use App\Models\User;
use App\Services\Marketplaces\TrendyolService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TrendyolOrderOpsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Order Ops Firma', 'email' => 'order-ops@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
        $this->setLiveOrderOpsFlag(false);
        $this->setLiveTestOrderFlag(false);
    }

    protected function tearDown(): void
    {
        $this->setLiveOrderOpsFlag(false);
        $this->setLiveTestOrderFlag(false);

        parent::tearDown();
    }

    public function test_get_shipment_packages_syncs_status_date_and_order_items(): void
    {
        $account = $this->trendyolAccount();
        Http::fakeSequence()
            ->push($this->fixture('shipment_packages_created.json'))
            ->push($this->fixture('shipment_packages_picking.json'));

        $result = app(TrendyolService::class)->syncShipmentPackages($account, [
            'statuses' => ['Created', 'Picking'],
            'startDate' => now()->subDay()->toISOString(),
            'endDate' => now()->toISOString(),
            'size' => 10,
        ]);

        $this->assertSame(2, $result['count']);
        $this->assertDatabaseHas('orders', [
            'marketplace_code' => 'trendyol',
            'marketplace_account_id' => $account->id,
            'marketplace_order_id' => 'TY-ORDER-900001',
            'provider_shipment_package_id' => 'PKG-900001',
            'provider_package_status' => 'Created',
            'shipping_status' => 'created',
        ]);
        $this->assertDatabaseHas('order_items', [
            'marketplace_account_id' => $account->id,
            'barcode' => '869000000901',
            'sku' => 'TY-SKU-901',
            'provider_line_id' => '701',
            'quantity' => 1,
        ]);

        Http::assertSentCount(2);
    }

    public function test_stream_next_cursor_is_persisted_and_duplicate_order_is_upserted(): void
    {
        $account = $this->trendyolAccount();
        Http::fakeSequence()
            ->push($this->fixture('shipment_packages_stream_page_1.json'))
            ->push($this->fixture('shipment_packages_stream_page_2.json'))
            ->push($this->fixture('shipment_packages_stream_page_1.json'));

        $service = app(TrendyolService::class);
        $first = $service->pullOrdersStream($account, ['size' => 1]);
        $second = $service->pullOrdersStream($account->fresh(), ['size' => 1]);
        $service->pullOrdersStream($account->fresh(), ['nextCursor' => 'manual-replay', 'size' => 1]);

        $this->assertTrue($first['has_more']);
        $this->assertSame('cursor-page-2', $first['next_cursor']);
        $this->assertFalse($second['has_more']);
        $this->assertDatabaseCount('orders', 2);
        $this->assertSame('cursor-page-2', data_get($account->fresh()->metadata, 'trendyol_order_stream.next_cursor'));
    }

    public function test_update_package_status_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/package-status", [
            'shipmentPackageId' => 'PKG-DRY',
            'status' => 'Picking',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_order_ops_disabled');

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_order_operations', [
            'marketplace_account_id' => $account->id,
            'order_id' => $order->id,
            'operation_type' => 'package_status_update',
            'status' => 'blocked',
        ]);
    }

    public function test_update_package_status_success_with_fake_provider_updates_local_status(): void
    {
        $this->setLiveOrderOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake(['*' => Http::response($this->fixture('update_package_status_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/package-status", [
            'shipmentPackageId' => 'PKG-DRY',
            'status' => 'Shipped',
            'lines' => [['lineId' => 'LINE-1', 'quantity' => 1]],
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'success');

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'provider_package_status' => 'Shipped',
            'shipping_status' => 'shipped',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'PUT' && str_contains($request->url(), '/shipment-packages/PKG-DRY'));
    }

    public function test_update_package_status_error_is_logged_without_success_status(): void
    {
        $this->setLiveOrderOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake(['*' => Http::response($this->fixture('update_package_status_error.json'), 409)]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/package-status", [
            'shipmentPackageId' => 'PKG-DRY',
            'status' => 'Delivered',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'failed');

        $this->assertDatabaseHas('marketplace_order_operations', [
            'order_id' => $order->id,
            'status' => 'failed',
            'error_code' => 'STATUS_CONFLICT',
        ]);
        $this->assertDatabaseMissing('orders', [
            'id' => $order->id,
            'provider_package_status' => 'Delivered',
        ]);
    }

    public function test_cancel_package_item_dry_run_and_success_are_account_isolated(): void
    {
        $account = $this->trendyolAccount(['name' => 'Magaza A']);
        $other = $this->trendyolAccount(['name' => 'Magaza B']);
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$other->id}/trendyol/orders/{$order->id}/cancel-item", [
            'shipmentPackageId' => 'PKG-DRY',
            'lineId' => 'LINE-1',
            'quantity' => 1,
            'reasonId' => '901',
        ])->assertForbidden();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cancel-item", [
            'shipmentPackageId' => 'PKG-DRY',
            'lineId' => 'LINE-1',
            'quantity' => 1,
            'reasonId' => '901',
            'description' => 'Tedarik edilemedi',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked');

        $this->setLiveOrderOpsFlag(true);
        Http::fake(['*' => Http::response($this->fixture('cancel_package_item_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cancel-item", [
            'shipmentPackageId' => 'PKG-DRY',
            'lineId' => 'LINE-1',
            'quantity' => 1,
            'reasonId' => '901',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'success');

        $this->assertDatabaseHas('order_items', [
            'order_id' => $order->id,
            'provider_line_id' => 'LINE-1',
            'provider_status' => 'cancelled',
            'cancel_reason_id' => '901',
        ]);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/items/unsupplied'));
    }

    public function test_operation_logs_do_not_store_provider_secrets(): void
    {
        $account = $this->trendyolAccount([
            'api_key' => 'api-key-secret-value',
            'api_secret' => 'api-secret-value',
            'supplier_id' => '1234567',
        ]);
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/package-status", [
            'shipmentPackageId' => 'PKG-DRY',
            'status' => 'Picking',
        ])->assertCreated();

        $operation = MarketplaceOrderOperation::firstOrFail();
        $serialized = json_encode($operation->toArray(), JSON_UNESCAPED_UNICODE);

        $this->assertStringNotContainsString('api-key-secret-value', $serialized);
        $this->assertStringNotContainsString('api-secret-value', $serialized);
        $this->assertStringNotContainsString('Author'.'ization', $serialized);
    }

    public function test_live_readonly_empty_fixtures_parse_without_network_or_duplicates(): void
    {
        $account = $this->trendyolAccount();
        Http::fakeSequence()
            ->push($this->fixture('live_shipment_packages_empty.json'))
            ->push($this->fixture('live_shipment_packages_stream_page_1.json'));

        $sync = app(TrendyolService::class)->syncShipmentPackages($account, [
            'statuses' => ['Created'],
            'startDate' => now()->subDays(30)->toISOString(),
            'endDate' => now()->toISOString(),
            'size' => 10,
        ]);
        $stream = app(TrendyolService::class)->pullOrdersStream($account->fresh(), ['size' => 10]);

        $this->assertSame(0, $sync['count']);
        $this->assertSame(0, $stream['count']);
        $this->assertFalse($stream['has_more']);
        $this->assertSame('', $stream['next_cursor']);
        $this->assertDatabaseCount('orders', 0);
        $this->assertDatabaseCount('order_items', 0);
        Http::assertSentCount(2);
    }

    public function test_live_readonly_fixtures_do_not_contain_secrets_or_customer_pii(): void
    {
        $files = [
            'live_shipment_packages_empty.json',
            'live_shipment_packages_stream_page_1.json',
        ];
        $needles = [
            'Author'.'ization',
            'Bearer ',
            'apiKey',
            'apiSecret',
            'token',
            'supplierId',
            'customer',
            'address',
            'phone',
            'email',
            'tckn',
            'taxNumber',
        ];

        foreach ($files as $file) {
            $content = file_get_contents($this->trendYolFixturePath($file));
            $this->assertJson($content);

            foreach ($needles as $needle) {
                $this->assertStringNotContainsString($needle, $content);
            }

            $this->assertDoesNotMatchRegularExpression('/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i', $content);
            $this->assertDoesNotMatchRegularExpression('/\+?\d[\d\s().-]{8,}\d/', $content);
        }
    }

    public function test_create_test_order_is_blocked_when_confirmation_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders", $this->testOrderPayload())
            ->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('error_code', 'live_test_order_not_confirmed')
            ->assertJsonPath('provider_called', false);

        Http::assertNothingSent();
        $this->assertDatabaseHas('api_logs', [
            'company_id' => $account->company_id,
            'marketplace_code' => 'trendyol',
            'method' => 'POST',
            'endpoint' => '/integration/test/order/orders/core',
            'error_message' => 'TRENDYOL_LIVE_TEST_ORDER_CONFIRMED=false oldugu icin test siparisi provider tarafina gonderilmedi.',
        ]);
    }

    public function test_create_test_order_is_blocked_for_production_account(): void
    {
        $this->setLiveTestOrderFlag(true);
        $account = $this->trendyolAccount(['metadata' => ['environment' => 'production']]);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders", $this->testOrderPayload())
            ->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('error_code', 'stage_environment_required')
            ->assertJsonPath('provider_called', false);

        Http::assertNothingSent();
    }

    public function test_create_test_order_stage_account_with_confirmation_uses_fake_provider_and_logs_success(): void
    {
        $this->setLiveTestOrderFlag(true);
        $account = $this->trendyolAccount();
        Http::fake(['https://stageapigw.trendyol.com/*' => Http::response($this->fixture('create_test_order_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders", $this->testOrderPayload())
            ->assertCreated()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('provider_called', true)
            ->assertJsonPath('result.provider_response.shipmentPackageId', 'PKG-TEST-001');

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_starts_with($request->url(), 'https://stageapigw.trendyol.com/integration/test/order/orders/core')
            && $request->hasHeader('sellerID', '12345'));
        $this->assertDatabaseHas('api_logs', [
            'marketplace_code' => 'trendyol',
            'method' => 'POST',
            'endpoint' => '/integration/test/order/orders/core',
            'status_code' => 200,
        ]);
    }

    public function test_create_test_order_provider_error_is_normalized_and_logged(): void
    {
        $this->setLiveTestOrderFlag(true);
        $account = $this->trendyolAccount();
        Http::fake(['https://stageapigw.trendyol.com/*' => Http::response($this->fixture('create_test_order_error.json'), 422)]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders", $this->testOrderPayload())
            ->assertCreated()
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('error_code', 'provider_error')
            ->assertJsonPath('provider_called', true);

        $this->assertDatabaseHas('api_logs', [
            'marketplace_code' => 'trendyol',
            'method' => 'POST',
            'endpoint' => '/integration/test/order/orders/core',
            'status_code' => 422,
        ]);
    }

    public function test_update_test_order_status_is_blocked_when_confirmation_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders/PKG-TEST-001/status", [
            'status' => 'Shipped',
            'lines' => [['lineId' => 'LINE-TEST-1', 'quantity' => 1]],
            'params' => ['trackingNumber' => 'TRACK-TEST'],
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('error_code', 'live_test_order_not_confirmed')
            ->assertJsonPath('provider_called', false);

        Http::assertNothingSent();
        $this->assertDatabaseHas('api_logs', [
            'marketplace_code' => 'trendyol',
            'method' => 'PUT',
            'endpoint' => '/integration/test/order/sellers/12345/shipment-packages/PKG-TEST-001/status',
        ]);
    }

    public function test_update_test_order_status_is_blocked_for_production_account(): void
    {
        $this->setLiveTestOrderFlag(true);
        $account = $this->trendyolAccount(['metadata' => ['environment' => 'production']]);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders/PKG-TEST-001/status", [
            'status' => 'Delivered',
            'lines' => [['lineId' => 'LINE-TEST-1', 'quantity' => 1]],
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('error_code', 'stage_environment_required');

        Http::assertNothingSent();
    }

    public function test_test_order_fixtures_and_logs_do_not_contain_secrets_or_real_pii(): void
    {
        $files = [
            'create_test_order_success.json',
            'create_test_order_error.json',
            'update_test_order_status_success.json',
            'update_test_order_status_error.json',
        ];

        foreach ($files as $file) {
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

        $account = $this->trendyolAccount();
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/test-orders", $this->testOrderPayload([
            'customer' => ['firstName' => 'Realish', 'lastName' => 'Person', 'email' => 'person@example.com', 'phone' => '+90 555 111 22 33'],
            'shippingAddress' => ['fullName' => 'Realish Person', 'address' => 'Some Real Street'],
        ]))->assertCreated();

        $serialized = json_encode(ApiLog::latest('id')->firstOrFail()->toArray(), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('person@example.com', $serialized);
        $this->assertStringNotContainsString('+90 555 111 22 33', $serialized);
        $this->assertStringNotContainsString('Some Real Street', $serialized);
    }

    private function trendYolFixturePath(string $file): string
    {
        return base_path("tests/Fixtures/trendyol/{$file}");
    }

    private function fixture(string $file): array
    {
        return json_decode(file_get_contents($this->trendYolFixturePath($file)), true);
    }

    private function testOrderPayload(array $overrides = []): array
    {
        return array_replace_recursive([
            'customer' => [
                'firstName' => 'Test',
                'lastName' => 'Customer',
                'email' => 'test@example.invalid',
                'phone' => '5550000000',
            ],
            'invoiceAddress' => [
                'fullName' => 'Test Customer',
                'address' => 'Test Address',
                'city' => 'Test City',
                'district' => 'Test District',
            ],
            'shippingAddress' => [
                'fullName' => 'Test Customer',
                'address' => 'Test Address',
                'city' => 'Test City',
                'district' => 'Test District',
            ],
            'seller' => [
                'sellerId' => 'masked-seller',
            ],
            'lines' => [[
                'barcode' => 'BARCODE-TEST-001',
                'quantity' => 1,
                'price' => 100,
                'productName' => 'Masked Test Product',
            ]],
        ], $overrides);
    }

    private function trendyolAccount(array $overrides = []): MarketplaceAccount
    {
        return MarketplaceAccount::create(array_merge([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol Test',
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
            'marketplace_order_id' => 'PKG-DRY',
            'provider_shipment_package_id' => 'PKG-DRY',
            'provider_package_status' => 'Created',
            'provider_status' => 'Created',
            'customer_name' => 'Masked Customer',
            'total_amount' => 100,
            'status' => 'new',
            'payload' => [],
        ]);
        $order->items()->create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'provider_line_id' => 'LINE-1',
            'barcode' => '869000000999',
            'sku' => 'TY-SKU-999',
            'name' => 'Masked Item',
            'quantity' => 1,
            'provider_status' => 'Created',
        ]);

        return $order->fresh(['items']);
    }

    private function setLiveOrderOpsFlag(bool $enabled): void
    {
        $value = $enabled ? 'true' : 'false';
        putenv("TRENDYOL_LIVE_ORDER_OPS_CONFIRMED={$value}");
        $_ENV['TRENDYOL_LIVE_ORDER_OPS_CONFIRMED'] = $value;
        $_SERVER['TRENDYOL_LIVE_ORDER_OPS_CONFIRMED'] = $value;
    }

    private function setLiveTestOrderFlag(bool $enabled): void
    {
        $value = $enabled ? 'true' : 'false';
        putenv("TRENDYOL_LIVE_TEST_ORDER_CONFIRMED={$value}");
        $_ENV['TRENDYOL_LIVE_TEST_ORDER_CONFIRMED'] = $value;
        $_SERVER['TRENDYOL_LIVE_TEST_ORDER_CONFIRMED'] = $value;
        config(['marketplaces.trendyol.live_test_order_confirmed' => $value]);
    }
}
