<?php

namespace Tests\Feature;

use App\Models\Company;
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
    }

    protected function tearDown(): void
    {
        $this->setLiveOrderOpsFlag(false);

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
}
