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

class TrendyolCargoOpsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Cargo Ops Firma', 'email' => 'cargo-ops@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
        $this->setLiveCargoOpsFlag(false);
    }

    protected function tearDown(): void
    {
        $this->setLiveCargoOpsFlag(false);

        parent::tearDown();
    }

    public function test_get_cargo_providers_success_is_normalized(): void
    {
        $account = $this->trendyolAccount();
        Http::fake(['*' => Http::response($this->fixture('cargo_providers_success.json'))]);

        $this->getJson("/api/marketplaces/{$account->id}/trendyol/cargo-providers")
            ->assertOk()
            ->assertJsonPath('providers.0.id', '10')
            ->assertJsonPath('providers.0.name', 'Masked Cargo')
            ->assertJsonPath('providers.1.id', '20')
            ->assertJsonPath('providers.1.name', 'Masked Express');

        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && str_contains($request->url(), '/cargo-providers'));
    }

    public function test_get_cargo_providers_error_is_normalized(): void
    {
        $account = $this->trendyolAccount();
        Http::fake(['*' => Http::response($this->fixture('cargo_providers_error.json'), 503)]);

        $this->getJson("/api/marketplaces/{$account->id}/trendyol/cargo-providers")
            ->assertStatus(503)
            ->assertJsonPath('message', 'Cargo providers could not be listed')
            ->assertJsonPath('details.code', 'CARGO_PROVIDER_LIST_ERROR');
    }

    public function test_update_box_info_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/box-info", [
            'shipmentPackageId' => 'PKG-CARGO',
            'desi' => 3.5,
            'boxQuantity' => 1,
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_cargo_ops_disabled');

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_order_operations', [
            'marketplace_account_id' => $account->id,
            'order_id' => $order->id,
            'operation_type' => 'cargo_box_info_update',
            'status' => 'blocked',
        ]);
    }

    public function test_update_box_info_rejects_missing_box_fields(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/box-info", [
            'shipmentPackageId' => 'PKG-CARGO',
        ])->assertUnprocessable();
    }

    public function test_update_box_info_success_and_error_are_logged(): void
    {
        $this->setLiveCargoOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        $error = $this->fixture('update_box_info_error.json');
        Http::fakeSequence()
            ->push($this->fixture('update_box_info_success.json'))
            ->push($error, 422)
            ->push($error, 422)
            ->push($error, 422)
            ->push($error, 422);

        $payload = ['shipmentPackageId' => 'PKG-CARGO', 'desi' => 4, 'boxQuantity' => 2, 'weight' => 1.25];
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/box-info", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'success');
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/box-info", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'failed')
            ->assertJsonPath('operation.error_code', 'BOX_INFO_INVALID');

        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/shipment-packages/PKG-CARGO/box-info'));
    }

    public function test_change_cargo_provider_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cargo-provider", [
            'shipmentPackageId' => 'PKG-CARGO',
            'cargoProviderId' => '10',
            'cargoProviderName' => 'Masked Cargo',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'live_cargo_ops_disabled');

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_order_operations', [
            'operation_type' => 'cargo_provider_change',
            'status' => 'blocked',
        ]);
    }

    public function test_change_cargo_provider_rejects_missing_provider_id(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cargo-provider", [
            'shipmentPackageId' => 'PKG-CARGO',
        ])->assertUnprocessable();
    }

    public function test_change_cargo_provider_success_and_error_are_logged(): void
    {
        $this->setLiveCargoOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        $error = $this->fixture('change_cargo_provider_error.json');
        Http::fakeSequence()
            ->push($this->fixture('change_cargo_provider_success.json'))
            ->push($error, 409)
            ->push($error, 409)
            ->push($error, 409)
            ->push($error, 409);

        $payload = ['shipmentPackageId' => 'PKG-CARGO', 'cargoProviderId' => '10', 'cargoProviderName' => 'Masked Cargo'];
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cargo-provider", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'success');
        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/cargo-provider", $payload)
            ->assertCreated()
            ->assertJsonPath('operation.status', 'failed')
            ->assertJsonPath('operation.error_code', 'CARGO_PROVIDER_INVALID');

        $this->assertDatabaseHas('orders', [
            'id' => $order->id,
            'cargo_provider_id' => '10',
            'cargo_provider_name' => 'Masked Cargo',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'PUT'
            && str_contains($request->url(), '/shipment-packages/PKG-CARGO/cargo-provider'));
    }

    public function test_delivered_by_service_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/delivered-by-service", [
            'shipmentPackageId' => 'PKG-CARGO',
            'serviceProvider' => 'Masked Service',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'cargo_delivered_by_service_deferred');

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_order_operations', [
            'operation_type' => 'cargo_delivered_by_service',
            'status' => 'blocked',
        ]);
    }

    public function test_delivered_by_service_stays_deferred_even_when_cargo_flag_is_true(): void
    {
        $this->setLiveCargoOpsFlag(true);
        $account = $this->trendyolAccount();
        $order = $this->orderWithItem($account);
        Http::fake(['*' => Http::response($this->fixture('delivered_by_service_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/delivered-by-service", [
            'shipmentPackageId' => 'PKG-CARGO',
            'serviceProvider' => 'Masked Service',
        ])->assertCreated()
            ->assertJsonPath('operation.status', 'blocked')
            ->assertJsonPath('operation.error_code', 'cargo_delivered_by_service_deferred');

        Http::assertNothingSent();
    }

    public function test_cargo_operations_are_account_isolated(): void
    {
        $account = $this->trendyolAccount(['name' => 'Magaza A']);
        $other = $this->trendyolAccount(['name' => 'Magaza B']);
        $order = $this->orderWithItem($account);

        $this->postJson("/api/marketplaces/{$other->id}/trendyol/orders/{$order->id}/box-info", [
            'shipmentPackageId' => 'PKG-CARGO',
            'desi' => 3,
        ])->assertForbidden();
    }

    public function test_cargo_fixtures_and_logs_do_not_leak_secrets_or_pii(): void
    {
        foreach ([
            'cargo_providers_success.json',
            'cargo_providers_error.json',
            'update_box_info_success.json',
            'update_box_info_error.json',
            'change_cargo_provider_success.json',
            'change_cargo_provider_error.json',
            'delivered_by_service_success.json',
            'delivered_by_service_error.json',
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

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/orders/{$order->id}/box-info", [
            'shipmentPackageId' => 'PKG-CARGO',
            'desi' => 3,
        ])->assertCreated();

        $serialized = json_encode(MarketplaceOrderOperation::query()->get()->toArray(), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('api-key-secret-value', $serialized);
        $this->assertStringNotContainsString('api-secret-value', $serialized);
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
            'name' => 'Trendyol Cargo Test',
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
            'marketplace_order_id' => 'TY-CARGO-ORDER',
            'provider_shipment_package_id' => 'PKG-CARGO',
            'provider_package_status' => 'Picking',
            'provider_status' => 'Picking',
            'cargo_provider_id' => '1',
            'cargo_provider_name' => 'Current Masked Cargo',
            'customer_name' => 'Masked Customer',
            'total_amount' => 100,
            'status' => 'new',
            'payload' => [],
        ]);
        $order->items()->create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'provider_line_id' => 'LINE-CARGO-1',
            'barcode' => '869000000996',
            'sku' => 'TY-SKU-996',
            'name' => 'Masked Item',
            'quantity' => 1,
            'provider_status' => 'Created',
        ]);

        return $order->fresh(['items']);
    }

    private function setLiveCargoOpsFlag(bool $enabled): void
    {
        $value = $enabled ? 'true' : 'false';
        putenv("TRENDYOL_LIVE_CARGO_OPS_CONFIRMED={$value}");
        $_ENV['TRENDYOL_LIVE_CARGO_OPS_CONFIRMED'] = $value;
        $_SERVER['TRENDYOL_LIVE_CARGO_OPS_CONFIRMED'] = $value;
        config(['marketplaces.trendyol.live_cargo_ops_confirmed' => $value]);
    }
}
