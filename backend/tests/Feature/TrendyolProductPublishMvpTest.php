<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceCatalogAttribute;
use App\Models\MarketplaceCatalogAttributeValue;
use App\Models\MarketplaceBrandMapping;
use App\Models\MarketplaceCategoryMapping;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Models\ProductMarketplaceStatus;
use App\Models\User;
use App\Services\Marketplaces\MarketplacePublishService;
use App\Services\Marketplaces\TrendyolService;
use App\Services\Products\ProductReadinessService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class TrendyolProductPublishMvpTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(DatabaseSeeder::class);
        $this->company = Company::create(['name' => 'MVP Firma', 'email' => 'mvp@example.test', 'is_active' => true]);
        $this->user = User::factory()->create(['company_id' => $this->company->id]);
        $this->user->assignRole('company_admin');
        Sanctum::actingAs($this->user);
    }

    public function test_publish_draft_requires_verified_trendyol_api_connection(): void
    {
        $account = $this->trendyolAccount(['connection_status' => 'pending', 'connection_checked_at' => null]);
        $product = $this->readyProduct();

        $this->postJson('/api/marketplace-publish/validate', [
            'marketplace_account_id' => $account->id,
            'product_ids' => [$product->id],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors(['marketplace_account_id']);
    }

    public function test_required_trendyol_attribute_values_block_publish_when_value_is_not_allowed(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct([
            'trendyol_attributes' => [['attributeId' => 338, 'attributeValueId' => 999]],
        ]);
        $this->categoryMapping();

        MarketplaceCatalogAttribute::create([
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'external_id' => '338',
            'name' => 'Renk',
            'required' => true,
            'allow_custom' => false,
        ]);
        MarketplaceCatalogAttributeValue::create([
            'marketplace_code' => 'trendyol',
            'category_external_id' => '11',
            'attribute_external_id' => '338',
            'external_id' => '1',
            'name' => 'Siyah',
        ]);

        $response = $this->postJson('/api/marketplace-publish/validate', [
            'marketplace_account_id' => $account->id,
            'product_ids' => [$product->id],
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->json();

        $this->assertContains('required_attributes', $response['readiness_report'][$product->id]['missing_fields']);
    }

    public function test_batch_result_updates_product_marketplace_status_by_barcode(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = MarketplacePublishDraft::create([
            'company_id' => $this->company->id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'operation_name' => 'MVP batch test',
            'operation_type' => 'product_send',
            'schedule' => 'manual',
            'status' => 'queued',
            'product_ids' => [$product->id],
            'batch_request_id' => 'batch-123',
        ]);

        Http::fake([
            '*' => Http::response([
                'items' => [[
                    'barcode' => '869000000011',
                    'stockCode' => 'SKU-MVP-1',
                    'status' => 'SUCCESS',
                ]],
            ]),
        ]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('result_summary.summary.success_count', 1);

        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_code' => 'trendyol',
            'status' => 'success',
            'provider_state' => 'approved',
            'batch_request_id' => 'batch-123',
            'marketplace_account_id' => $account->id,
        ]);
    }

    public function test_duplicate_send_dispatches_single_job_for_same_draft(): void
    {
        Queue::fake();
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id]);

        $service = app(MarketplacePublishService::class);
        $service->send($draft);
        $service->send($draft->fresh());

        Queue::assertPushed(\App\Jobs\Trendyol\RunTrendyolProductPublishDraftJob::class, 1);
    }

    public function test_job_retry_does_not_send_again_when_batch_id_exists(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], [
            'status' => 'queued',
            'batch_request_id' => 'batch-existing',
        ]);

        Http::fake();

        app(\App\Jobs\Trendyol\RunTrendyolProductPublishDraftJob::class, ['draft' => $draft])->handle(app(MarketplacePublishService::class));

        Http::assertNothingSent();
        $this->assertSame('queued', $draft->fresh()->status);
    }

    public function test_scheduled_dispatch_claims_due_draft_once(): void
    {
        Queue::fake();
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $this->readyDraft($account, [$product->id], [
            'status' => 'ready',
            'schedule' => 'daily',
            'next_run_at' => now()->subMinute(),
        ]);

        $service = app(MarketplacePublishService::class);

        $this->assertSame(1, $service->dispatchDueScheduledDrafts());
        $this->assertSame(0, $service->dispatchDueScheduledDrafts());
        Queue::assertPushed(\App\Jobs\Trendyol\RunTrendyolProductPublishDraftJob::class, 1);
    }

    public function test_batch_result_is_isolated_per_marketplace_account(): void
    {
        $accountA = $this->trendyolAccount(['name' => 'Magaza A']);
        $accountB = $this->trendyolAccount(['name' => 'Magaza B']);
        $product = $this->readyProduct();
        $draftA = $this->readyDraft($accountA, [$product->id], ['status' => 'queued', 'batch_request_id' => 'batch-a']);
        $draftB = $this->readyDraft($accountB, [$product->id], ['status' => 'queued', 'batch_request_id' => 'batch-b']);

        Http::fakeSequence()
            ->push(['items' => [['barcode' => $product->barcode, 'status' => 'SUCCESS']]])
            ->push(['items' => [['barcode' => $product->barcode, 'status' => 'FAILED', 'failureReasons' => [['message' => 'Kategori hatasi']]]]]);

        $this->postJson("/api/marketplace-publish-drafts/{$draftA->id}/batch-result")->assertOk();
        $this->postJson("/api/marketplace-publish-drafts/{$draftB->id}/batch-result")->assertOk();

        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $accountA->id,
            'status' => 'success',
            'batch_request_id' => 'batch-a',
        ]);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $accountB->id,
            'status' => 'failed',
            'batch_request_id' => 'batch-b',
        ]);
    }

    public function test_batch_partial_failure_and_unmatched_items_are_reported(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'queued', 'batch_request_id' => 'batch-partial']);

        Http::fake([
            '*' => Http::response([
                'items' => [
                    ['barcode' => $product->barcode, 'status' => 'SUCCESS'],
                    ['barcode' => 'UNKNOWN', 'status' => 'FAILED', 'failureReasons' => [['message' => 'Barkod bulunamadi']]],
                ],
            ]),
        ]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'partial_success')
            ->assertJsonPath('result_summary.summary.success_count', 1)
            ->assertJsonPath('result_summary.summary.failed_count', 1);
    }

    public function test_batch_processing_empty_result_is_not_failed(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-processing']);

        Http::fake(['*' => Http::response(['status' => 'IN_PROGRESS'])]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'processing')
            ->assertJsonPath('result_summary.summary.processing_count', 1);
    }

    public function test_batch_general_error_is_reported_without_item_match(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-error']);

        Http::fake(['*' => Http::response(['status' => 'FAILED', 'message' => 'Batch genel hata'])]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('result_summary.summary.general_error', 'Batch genel hata');
    }

    public function test_fixture_batch_created_response_submits_products(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'running']);

        Http::fakeSequence()
            ->push($this->fixture('filter_products_not_found'))
            ->push($this->fixture('filter_products_not_found'))
            ->push($this->fixture('product_publish_batch_created'));

        $products = Product::query()->whereKey([$product->id])->get();

        $result = app(TrendyolService::class)->sendProductCollection($account, $products, $draft);

        $this->assertSame('batch-fixture-created-001', $result['batch_request_id']);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'status' => 'submitted',
            'provider_state' => 'not_found',
            'batch_request_id' => 'batch-fixture-created-001',
        ]);
    }

    public function test_fixture_batch_processing_response_is_not_failed(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-processing-001']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_processing'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'processing')
            ->assertJsonPath('result_summary.summary.processing_count', 1);
    }

    public function test_fixture_batch_success_response_updates_sku_status(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-success']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_success'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('result_summary.summary.items.0.sku', 'SKU-MVP-1')
            ->assertJsonPath('result_summary.summary.items.0.barcode', '869000000011')
            ->assertJsonPath('result_summary.summary.items.0.provider_state', 'approved');
    }

    public function test_live_fixture_batch_success_response_uses_nested_stock_code(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct(['sku' => 'TY-TEST-***', 'barcode' => 'TYTEST***']);
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'masked-live-batch-id']);

        Http::fake(['*' => Http::response($this->fixture('live_product_publish_batch_success'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'completed')
            ->assertJsonPath('result_summary.summary.items.0.sku', 'TY-TEST-***')
            ->assertJsonPath('result_summary.summary.items.0.barcode', 'TYTEST***')
            ->assertJsonPath('result_summary.summary.items.0.marketplace_account_id', $account->id)
            ->assertJsonPath('result_summary.summary.items.0.provider_state', 'approved');
    }

    public function test_fixture_batch_partial_failure_isolates_item_statuses(): void
    {
        $account = $this->trendyolAccount();
        $success = $this->readyProduct();
        $failed = $this->readyProduct(['sku' => 'SKU-MVP-FAILED', 'barcode' => '869000000099']);
        $draft = $this->readyDraft($account, [$success->id, $failed->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-partial']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_partial_failure'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'partial_success')
            ->assertJsonPath('result_summary.summary.success_count', 1)
            ->assertJsonPath('result_summary.summary.failed_count', 1)
            ->assertJsonPath('result_summary.summary.items.1.error_code', 'ATTRIBUTE_VALUE_INVALID');

        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $success->id,
            'marketplace_account_id' => $account->id,
            'status' => 'success',
            'provider_state' => 'approved',
        ]);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $failed->id,
            'marketplace_account_id' => $account->id,
            'status' => 'failed',
            'provider_state' => 'unapproved',
        ]);
    }

    public function test_fixture_batch_general_error_response_is_normalized(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-general-error-001']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_general_error'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('result_summary.summary.general_error', 'Batch genel hata');
    }

    public function test_fixture_batch_unknown_status_stays_recheck_needed(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-unknown']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_unknown_status'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'processing')
            ->assertJsonPath('result_summary.summary.unknown_count', 1);
    }

    public function test_fixture_batch_unmatched_item_is_not_linked_to_wrong_product(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-fixture-unmatched']);

        Http::fake(['*' => Http::response($this->fixture('product_publish_batch_unmatched_item'))]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'rejected')
            ->assertJsonPath('result_summary.summary.unmatched_items.0.barcode', '869000000404')
            ->assertJsonPath('result_summary.summary.items.0.product_id', null);

        $this->assertDatabaseMissing('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'batch_request_id' => 'batch-fixture-unmatched',
        ]);
    }

    public function test_fixture_provider_state_responses_map_approved_unapproved_and_not_found(): void
    {
        $account = $this->trendyolAccount();
        $approved = $this->readyProduct(['sku' => 'SKU-APPROVED', 'barcode' => '869APPROVED']);
        $unapproved = $this->readyProduct(['sku' => 'SKU-UNAPPROVED', 'barcode' => '869UNAPPROVED']);
        $missing = $this->readyProduct(['sku' => 'SKU-MISSING', 'barcode' => '869MISSING']);

        Http::fakeSequence()
            ->push($this->fixture('filter_products_approved'))
            ->push($this->fixture('filter_products_unapproved'));

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, collect([$approved, $unapproved, $missing]));

        $this->assertSame('approved', $states[$approved->id]);
        $this->assertSame('unapproved', $states[$unapproved->id]);
        $this->assertSame('not_found', $states[$missing->id]);
    }

    public function test_fixture_provider_not_found_response_marks_not_found(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct(['sku' => 'SKU-MISSING', 'barcode' => '869MISSING']);

        Http::fakeSequence()
            ->push($this->fixture('filter_products_not_found'))
            ->push($this->fixture('filter_products_not_found'));

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, collect([$product]));

        $this->assertSame('not_found', $states[$product->id]);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'provider_state' => 'not_found',
        ]);
    }

    public function test_fixture_provider_error_marks_unknown_without_failing_batch(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct(['sku' => 'SKU-RATE-LIMIT', 'barcode' => '869RATELIMIT']);

        Http::fake(['*' => Http::response($this->fixture('provider_error'), 429)]);

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, collect([$product]));

        $this->assertSame('unknown', $states[$product->id]);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'provider_state' => 'unknown',
        ]);
    }

    public function test_bulk_provider_state_resolver_does_not_query_per_product(): void
    {
        $account = $this->trendyolAccount();
        $products = collect(range(1, 120))->map(fn (int $index) => $this->readyProduct([
            'sku' => "SKU-BULK-{$index}",
            'barcode' => "869BULK{$index}",
        ]));

        Http::fakeSequence()
            ->push([
                'content' => $products->take(70)->map(fn (Product $product) => [
                    'barcode' => $product->barcode,
                    'stockCode' => $product->sku,
                ])->values()->all(),
                'totalPages' => 1,
            ])
            ->push([
                'content' => $products->slice(70, 25)->map(fn (Product $product) => [
                    'barcode' => $product->barcode,
                    'stockCode' => $product->sku,
                ])->values()->all(),
                'totalPages' => 1,
            ]);

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, $products);

        $this->assertSame('approved', $states[$products[0]->id]);
        $this->assertSame('unapproved', $states[$products[70]->id]);
        $this->assertSame('not_found', $states[$products[119]->id]);
        Http::assertSentCount(2);
    }

    public function test_provider_state_resolver_reuses_duplicate_barcode_or_sku_matches(): void
    {
        $account = $this->trendyolAccount();
        $first = $this->readyProduct(['sku' => 'SKU-DUP-A', 'barcode' => '869DUP']);
        $second = $this->readyProduct(['sku' => 'SKU-DUP-B', 'barcode' => '869DUP']);

        Http::fakeSequence()
            ->push(['content' => [['barcode' => '869DUP', 'stockCode' => 'SKU-DUP-A']], 'totalPages' => 1])
            ->push(['content' => [], 'totalPages' => 1]);

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, collect([$first, $second]));

        $this->assertSame('approved', $states[$first->id]);
        $this->assertSame('approved', $states[$second->id]);
        Http::assertSentCount(1);
    }

    public function test_provider_state_api_error_marks_unknown_without_throwing(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct(['sku' => 'SKU-UNKNOWN', 'barcode' => '869UNKNOWN']);

        Http::fake(['*' => Http::response(['message' => 'Provider gecici hata'], 500)]);

        $states = app(TrendyolService::class)->resolveProductProviderStates($account, collect([$product]));

        $this->assertSame('unknown', $states[$product->id]);
        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'provider_state' => 'unknown',
        ]);
    }

    public function test_readiness_is_account_aware_when_mapping_is_account_scoped(): void
    {
        $accountA = $this->trendyolAccount(['name' => 'Magaza A']);
        $accountB = $this->trendyolAccount(['name' => 'Magaza B']);
        $product = $this->readyProduct();
        $this->categoryMapping(['metadata' => ['marketplace_account_id' => $accountA->id]]);

        $service = app(ProductReadinessService::class);
        $reportA = $service->check($product, 'trendyol', $accountA)['marketplaces']['trendyol'];
        $reportB = $service->check($product, 'trendyol', $accountB)['marketplaces']['trendyol'];

        $this->assertSame($accountA->id, $reportA['marketplace_account_id']);
        $this->assertTrue($reportA['checks']['category_mapping']);
        $this->assertFalse($reportB['checks']['category_mapping']);
        $this->assertContains('category_mapping', $reportB['missing_fields']);
    }

    public function test_publish_draft_uses_account_specific_readiness(): void
    {
        $accountA = $this->trendyolAccount(['name' => 'Magaza A']);
        $accountB = $this->trendyolAccount(['name' => 'Magaza B']);
        $product = $this->readyProduct();
        $this->categoryMapping(['metadata' => ['marketplace_account_id' => $accountA->id]]);

        $response = $this->postJson('/api/marketplace-publish/validate', [
            'marketplace_account_id' => $accountB->id,
            'product_ids' => [$product->id],
        ])->assertCreated()
            ->assertJsonPath('status', 'blocked')
            ->json();

        $this->assertContains('category_mapping', $response['readiness_report'][$product->id]['missing_fields']);
    }

    public function test_batch_unknown_status_is_recheck_needed_not_failed(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-unknown']);

        Http::fake(['*' => Http::response(['items' => [['barcode' => $product->barcode, 'status' => 'MYSTERY']]])]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")
            ->assertOk()
            ->assertJsonPath('status', 'processing')
            ->assertJsonPath('result_summary.summary.unknown_count', 1);

        $this->assertDatabaseHas('product_marketplace_statuses', [
            'product_id' => $product->id,
            'marketplace_account_id' => $account->id,
            'status' => 'unknown',
            'provider_state' => 'unknown',
        ]);
    }

    public function test_batch_result_reprocess_is_idempotent_per_account_product(): void
    {
        $account = $this->trendyolAccount();
        $product = $this->readyProduct();
        $draft = $this->readyDraft($account, [$product->id], ['status' => 'submitted', 'batch_request_id' => 'batch-idempotent']);

        Http::fake(['*' => Http::response(['items' => [['barcode' => $product->barcode, 'status' => 'SUCCESS']]])]);

        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")->assertOk();
        $this->postJson("/api/marketplace-publish-drafts/{$draft->id}/batch-result")->assertOk();

        $this->assertSame(1, ProductMarketplaceStatus::query()
            ->where('product_id', $product->id)
            ->where('marketplace_account_id', $account->id)
            ->where('marketplace_code', 'trendyol')
            ->count());
    }

    public function test_marketplace_publish_mvp_migration_rolls_back_and_migrates_again(): void
    {
        $this->artisan('migrate:rollback', ['--step' => 2])->assertExitCode(0);
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasTable('marketplace_return_claims'));
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('marketplace_publish_drafts', 'operation_name'));

        $this->artisan('migrate')->assertExitCode(0);
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('marketplace_publish_drafts', 'operation_name'));
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('product_marketplace_statuses', 'marketplace_account_id'));
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasTable('marketplace_return_claims'));
    }

    private function trendyolAccount(array $overrides = []): MarketplaceAccount
    {
        return MarketplaceAccount::create(array_merge([
            'company_id' => $this->company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol Magaza',
            'supplier_id' => '12345',
            'api_key' => 'api-key',
            'api_secret' => 'api-secret',
            'is_active' => true,
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
        ], $overrides));
    }

    private function readyProduct(array $overrides = []): Product
    {
        return Product::create(array_merge([
            'company_id' => $this->company->id,
            'sku' => 'SKU-MVP-1',
            'barcode' => '869000000011',
            'name' => 'Kanvas Tablo',
            'brand' => 'Balina Home',
            'trendyol_brand_id' => 501,
            'category' => 'Kanvas Tablo',
            'trendyol_category_id' => 11,
            'short_description' => 'Kisa aciklama',
            'description' => 'Detayli aciklama',
            'seo_title' => 'SEO Baslik',
            'seo_description' => 'SEO aciklama',
            'price' => 100,
            'list_price' => 120,
            'stock' => 5,
            'vat_rate' => 20,
            'dimensional_weight' => 1,
            'shipping_type' => 'standard',
            'main_image_url' => 'https://example.test/image.jpg',
            'trendyol_attributes' => [['attributeId' => 338, 'attributeValueId' => 1]],
            'attributes' => ['Renk' => 'Siyah'],
            'status' => 'active',
        ], $overrides));
    }

    private function readyDraft(MarketplaceAccount $account, array $productIds, array $overrides = []): MarketplacePublishDraft
    {
        return MarketplacePublishDraft::create(array_merge([
            'company_id' => $this->company->id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'operation_name' => 'MVP draft',
            'operation_type' => 'product_send',
            'schedule' => 'manual',
            'status' => 'ready',
            'product_ids' => $productIds,
            'readiness_report' => [],
            'payload_preview' => [],
        ], $overrides));
    }

    private function categoryMapping(array $overrides = []): MarketplaceCategoryMapping
    {
        return MarketplaceCategoryMapping::create(array_merge([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Kanvas Tablo',
            'marketplace_category_id' => '11',
            'marketplace_category_name' => 'Kanvas Tablo',
            'marketplace_category_path' => 'Ev > Dekorasyon > Kanvas Tablo',
            'status' => 'active',
        ], $overrides));
    }

    private function fixture(string $name): array
    {
        $path = base_path("tests/Fixtures/trendyol/{$name}.json");

        $this->assertFileExists($path);

        return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
    }
}
