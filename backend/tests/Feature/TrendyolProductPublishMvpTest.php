<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceCatalogAttribute;
use App\Models\MarketplaceCatalogAttributeValue;
use App\Models\MarketplaceCategoryMapping;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Models\User;
use App\Services\Marketplaces\MarketplacePublishService;
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

    public function test_marketplace_publish_mvp_migration_rolls_back_and_migrates_again(): void
    {
        $this->artisan('migrate:rollback', ['--step' => 1])->assertExitCode(0);
        $this->assertFalse(\Illuminate\Support\Facades\Schema::hasColumn('marketplace_publish_drafts', 'operation_name'));

        $this->artisan('migrate')->assertExitCode(0);
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('marketplace_publish_drafts', 'operation_name'));
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('product_marketplace_statuses', 'marketplace_account_id'));
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

    private function categoryMapping(): MarketplaceCategoryMapping
    {
        return MarketplaceCategoryMapping::create([
            'company_id' => $this->company->id,
            'marketplace_code' => 'trendyol',
            'local_category_name' => 'Kanvas Tablo',
            'marketplace_category_id' => '11',
            'marketplace_category_name' => 'Kanvas Tablo',
            'marketplace_category_path' => 'Ev > Dekorasyon > Kanvas Tablo',
            'status' => 'active',
        ]);
    }
}
