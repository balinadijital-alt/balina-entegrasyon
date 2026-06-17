<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceReturnClaim;
use App\Models\MarketplaceReturnClaimItem;
use App\Models\MarketplaceReturnOperation;
use App\Models\User;
use App\Exceptions\MarketplaceApiException;
use App\Services\Marketplaces\TrendyolService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TrendyolReturnOpsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'Return Ops Firma', 'email' => 'return-ops@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
        $this->setLiveReturnOpsFlag(false);
    }

    protected function tearDown(): void
    {
        $this->setLiveReturnOpsFlag(false);

        parent::tearDown();
    }

    public function test_claim_sync_upserts_claim_items_and_is_idempotent(): void
    {
        $account = $this->trendyolAccount();
        Http::fakeSequence()
            ->push($this->fixture('return_claims_list.json'))
            ->push($this->fixture('return_claims_list.json'));

        app(TrendyolService::class)->syncReturnClaims($account, ['size' => 50]);
        $result = app(TrendyolService::class)->syncReturnClaims($account, ['size' => 50]);

        $this->assertSame(1, $result['count']);
        $this->assertDatabaseCount('marketplace_return_claims', 1);
        $this->assertDatabaseCount('marketplace_return_claim_items', 2);
        $this->assertDatabaseHas('marketplace_return_claims', [
            'marketplace_account_id' => $account->id,
            'provider_claim_id' => 'CLAIM-TEST-001',
            'provider_shipment_package_id' => 'PKG-TEST-001',
            'customer_masked' => '[masked-customer]',
        ]);
        $this->assertDatabaseHas('marketplace_return_claim_items', [
            'marketplace_account_id' => $account->id,
            'provider_claim_line_item_id' => 'LINE-RETURN-002',
            'barcode' => 'BARCODE-RETURN-002',
            'sku' => 'SKU-RETURN-002',
        ]);
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_sync',
            'status' => 'success',
        ]);
        Http::assertSentCount(2);
    }

    public function test_empty_claim_sync_is_safe(): void
    {
        $account = $this->trendyolAccount();
        Http::fake(['*' => Http::response($this->fixture('return_claims_empty.json'))]);

        $result = app(TrendyolService::class)->syncReturnClaims($account, ['size' => 50]);

        $this->assertSame(0, $result['count']);
        $this->assertDatabaseCount('marketplace_return_claims', 0);
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_sync',
            'status' => 'success',
        ]);
    }

    public function test_live_empty_claim_sync_fixture_is_safe_and_idempotent(): void
    {
        $account = $this->trendyolAccount();
        Http::fakeSequence()
            ->push($this->fixture('live_return_claims_empty.json'))
            ->push($this->fixture('live_return_claims_empty.json'));

        app(TrendyolService::class)->syncReturnClaims($account, ['size' => 10]);
        $result = app(TrendyolService::class)->syncReturnClaims($account, ['size' => 10]);

        $this->assertSame(0, $result['count']);
        $this->assertDatabaseCount('marketplace_return_claims', 0);
        $this->assertDatabaseCount('marketplace_return_claim_items', 0);
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_sync',
            'status' => 'success',
        ]);
        Http::assertSentCount(2);
    }

    public function test_claim_sync_is_account_isolated(): void
    {
        $accountA = $this->trendyolAccount(['name' => 'Magaza A']);
        $accountB = $this->trendyolAccount(['name' => 'Magaza B']);
        Http::fakeSequence()
            ->push($this->fixture('return_claims_list.json'))
            ->push($this->fixture('return_claims_list.json'));

        app(TrendyolService::class)->syncReturnClaims($accountA);
        app(TrendyolService::class)->syncReturnClaims($accountB);

        $this->assertDatabaseCount('marketplace_return_claims', 2);
        $this->assertDatabaseHas('marketplace_return_claims', [
            'marketplace_account_id' => $accountA->id,
            'provider_claim_id' => 'CLAIM-TEST-001',
        ]);
        $this->assertDatabaseHas('marketplace_return_claims', [
            'marketplace_account_id' => $accountB->id,
            'provider_claim_id' => 'CLAIM-TEST-001',
        ]);
    }

    public function test_return_read_endpoints_reject_other_tenant_account(): void
    {
        $otherCompany = Company::create(['name' => 'Other Return Firma', 'email' => 'other-return@example.test', 'is_active' => true]);
        $otherAccount = MarketplaceAccount::create([
            'company_id' => $otherCompany->id,
            'code' => 'trendyol',
            'name' => 'Other Trendyol',
            'supplier_id' => '54321',
            'api_key' => 'masked-api-key',
            'api_secret' => 'masked-api-secret',
            'is_active' => true,
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
        ]);

        $this->getJson("/api/marketplaces/{$otherAccount->id}/trendyol/returns/claims")->assertForbidden();
        $this->getJson("/api/marketplaces/{$otherAccount->id}/trendyol/returns/issue-reasons")->assertForbidden();
    }

    public function test_issue_reasons_are_parsed_and_logged(): void
    {
        $account = $this->trendyolAccount();
        Http::fake(['*' => Http::response($this->fixture('return_issue_reasons.json'))]);

        $response = $this->getJson("/api/marketplaces/{$account->id}/trendyol/returns/issue-reasons")
            ->assertOk()
            ->json();

        $this->assertCount(2, $response['reasons']);
        $this->assertSame('201', $response['reasons'][0]['id']);
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_reason_sync',
            'status' => 'success',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'GET'
            && str_contains($request->url(), '/integration/order/claim-issue-reasons')
            && ! str_contains($request->url(), '/claims/issue-reasons'));
    }

    public function test_issue_reasons_unauthorized_does_not_mark_connected_account_failed(): void
    {
        $account = $this->trendyolAccount(['connection_status' => 'connected']);
        Http::fake(['*' => Http::response([], 401)]);

        $this->expectException(MarketplaceApiException::class);

        try {
            app(TrendyolService::class)->getClaimIssueReasons($account);
        } finally {
            $this->assertSame('connected', $account->fresh()->connection_status);
            Http::assertSent(fn ($request) => $request->method() === 'GET'
                && str_contains($request->url(), '/integration/order/claim-issue-reasons'));
        }
    }

    public function test_create_claim_issue_requires_reason(): void
    {
        $account = $this->trendyolAccount();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/issue", [
            'claimLineItemId' => 'LINE-RETURN-001',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['reasonId']);
    }

    public function test_create_claim_issue_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->syncedAccount();
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/issue", [
            'claimLineItemId' => 'LINE-RETURN-001',
            'reasonId' => '201',
            'description' => 'Masked test issue',
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('error_code', 'live_return_ops_disabled')
            ->assertJsonPath('provider_called', false);

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_issue_create',
            'status' => 'blocked',
            'error_code' => 'live_return_ops_disabled',
        ]);
    }

    public function test_create_claim_issue_success_with_fake_provider_logs_operation(): void
    {
        $this->setLiveReturnOpsFlag(true);
        $account = $this->syncedAccount();
        Http::fake(['*' => Http::response($this->fixture('create_claim_issue_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/issue", [
            'claimLineItemId' => 'LINE-RETURN-001',
            'reasonId' => '201',
        ])->assertCreated()
            ->assertJsonPath('status', 'success')
            ->assertJsonPath('provider_called', true);

        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/claims/CLAIM-TEST-001/items/issue'));
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_issue_create',
            'status' => 'success',
        ]);
    }

    public function test_create_claim_issue_provider_error_is_logged(): void
    {
        $this->setLiveReturnOpsFlag(true);
        $account = $this->syncedAccount();
        Http::fake(['*' => Http::response($this->fixture('create_claim_issue_error.json'), 409)]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/issue", [
            'claimLineItemId' => 'LINE-RETURN-001',
            'reasonId' => '201',
        ])->assertCreated()
            ->assertJsonPath('status', 'failed')
            ->assertJsonPath('error_code', 'provider_error');

        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_issue_create',
            'status' => 'failed',
            'error_code' => 'provider_error',
        ]);
    }

    public function test_approve_claim_line_items_is_blocked_when_live_flag_is_false(): void
    {
        $account = $this->syncedAccount();
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/approve", [
            'claimLineItemIds' => ['LINE-RETURN-001'],
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->assertJsonPath('provider_called', false);

        Http::assertNothingSent();
        $this->assertDatabaseHas('marketplace_return_claim_items', [
            'marketplace_account_id' => $account->id,
            'provider_claim_line_item_id' => 'LINE-RETURN-001',
            'status' => 'WaitingInAction',
        ]);
    }

    public function test_approve_claim_line_items_success_updates_local_item(): void
    {
        $this->setLiveReturnOpsFlag(true);
        $account = $this->syncedAccount();
        Http::fake(['*' => Http::response($this->fixture('approve_claim_line_items_success.json'))]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/approve", [
            'claimLineItemIds' => ['LINE-RETURN-001'],
        ])->assertCreated()
            ->assertJsonPath('status', 'success');

        $this->assertDatabaseHas('marketplace_return_claim_items', [
            'marketplace_account_id' => $account->id,
            'provider_claim_line_item_id' => 'LINE-RETURN-001',
            'status' => 'approved',
        ]);
        Http::assertSent(fn ($request) => $request->method() === 'POST'
            && str_contains($request->url(), '/claims/CLAIM-TEST-001/items/approve'));
    }

    public function test_approve_claim_line_items_provider_error_does_not_update_local_item(): void
    {
        $this->setLiveReturnOpsFlag(true);
        $account = $this->syncedAccount();
        Http::fake(['*' => Http::response($this->fixture('approve_claim_line_items_error.json'), 409)]);

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/approve", [
            'claimLineItemIds' => ['LINE-RETURN-001'],
        ])->assertCreated()
            ->assertJsonPath('status', 'failed');

        $this->assertDatabaseHas('marketplace_return_claim_items', [
            'marketplace_account_id' => $account->id,
            'provider_claim_line_item_id' => 'LINE-RETURN-001',
            'status' => 'WaitingInAction',
        ]);
    }

    public function test_claim_item_audits_are_parsed_and_logged(): void
    {
        $account = $this->syncedAccount();
        Http::fake(['*' => Http::response($this->fixture('claim_item_audits.json'))]);

        $response = $this->getJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/audits?claimLineItemId=LINE-RETURN-001")
            ->assertOk()
            ->json();

        $this->assertCount(2, $response['audits']);
        $this->assertDatabaseHas('marketplace_return_operations', [
            'marketplace_account_id' => $account->id,
            'operation_type' => 'return_claim_audit_sync',
            'status' => 'success',
        ]);
    }

    public function test_return_fixtures_and_operations_do_not_store_secrets_or_real_pii(): void
    {
        $files = [
            'return_claims_list.json',
            'return_claims_empty.json',
            'live_return_claims_empty.json',
            'return_issue_reasons.json',
            'create_claim_issue_success.json',
            'create_claim_issue_error.json',
            'approve_claim_line_items_success.json',
            'approve_claim_line_items_error.json',
            'claim_item_audits.json',
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
            $contentWithoutIsoDates = preg_replace('/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/', '[date]', $content);
            $this->assertDoesNotMatchRegularExpression('/\+?\d[\d\s().-]{8,}\d/', $contentWithoutIsoDates);
        }

        $account = $this->syncedAccount(['api_key' => 'api-key-secret-value', 'api_secret' => 'api-secret-value']);
        Http::fake();

        $this->postJson("/api/marketplaces/{$account->id}/trendyol/returns/CLAIM-TEST-001/issue", [
            'claimLineItemId' => 'LINE-RETURN-001',
            'reasonId' => '201',
            'description' => 'Masked test issue',
        ])->assertCreated();

        $serialized = json_encode(MarketplaceReturnOperation::latest('id')->firstOrFail()->toArray(), JSON_UNESCAPED_UNICODE);
        $this->assertStringNotContainsString('api-key-secret-value', $serialized);
        $this->assertStringNotContainsString('api-secret-value', $serialized);
        $this->assertStringNotContainsString('Author'.'ization', $serialized);
    }

    private function syncedAccount(array $overrides = []): MarketplaceAccount
    {
        $account = $this->trendyolAccount($overrides);
        $claim = MarketplaceReturnClaim::create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'provider_claim_id' => 'CLAIM-TEST-001',
            'provider_order_number' => 'ORDER-TEST-001',
            'provider_shipment_package_id' => 'PKG-TEST-001',
            'status' => 'Created',
            'customer_masked' => '[masked-customer]',
            'last_synced_at' => now(),
            'provider_payload' => [],
        ]);
        MarketplaceReturnClaimItem::create([
            'marketplace_return_claim_id' => $claim->id,
            'marketplace_account_id' => $account->id,
            'provider_claim_line_item_id' => 'LINE-RETURN-001',
            'barcode' => 'BARCODE-RETURN-001',
            'sku' => 'SKU-RETURN-001',
            'quantity' => 1,
            'status' => 'WaitingInAction',
            'provider_payload' => [],
        ]);

        return $account;
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
            'name' => 'Trendyol Return Test',
            'supplier_id' => '12345',
            'api_key' => 'masked-api-key',
            'api_secret' => 'masked-api-secret',
            'is_active' => true,
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
            'metadata' => ['environment' => 'stage'],
        ], $overrides));
    }

    private function setLiveReturnOpsFlag(bool $enabled): void
    {
        $value = $enabled ? 'true' : 'false';
        putenv("TRENDYOL_LIVE_RETURN_OPS_CONFIRMED={$value}");
        $_ENV['TRENDYOL_LIVE_RETURN_OPS_CONFIRMED'] = $value;
        $_SERVER['TRENDYOL_LIVE_RETURN_OPS_CONFIRMED'] = $value;
        config(['marketplaces.trendyol.live_return_ops_confirmed' => $value]);
    }
}
