<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\CompanySetting;
use App\Models\MarketplaceAccount;
use App\Models\SyncRun;
use App\Models\User;
use App\Models\WebhookDeliveryLog;
use App\Jobs\Notifications\DispatchWebhookNotificationJob;
use App\Services\Queue\SyncRunService;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CompanySettingsControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_settings_endpoint_returns_default_shape(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $response = $this->getJson('/api/settings')->assertOk();

        $this->assertSame(
            '{"notifications":{},"email":{},"webhooks":{},"localization":{},"theme":{},"security":{}}',
            $response->getContent(),
        );
    }

    public function test_tenant_user_can_persist_only_own_company_settings(): void
    {
        $ownCompany = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        CompanySetting::create([
            'company_id' => $otherCompany->id,
            'settings' => ['theme' => ['mode' => 'dark']],
        ]);

        $this->putJson('/api/settings', [
            'company_id' => $ownCompany->id,
            'notifications' => ['email_enabled' => true],
            'theme' => ['mode' => 'light'],
            'security' => ['mask_credentials' => true],
        ])
            ->assertOk()
            ->assertJsonPath('notifications.email_enabled', true)
            ->assertJsonPath('theme.mode', 'light')
            ->assertJsonPath('security.mask_credentials', true)
            ->assertJsonPath('webhooks', []);

        $this->assertSame('light', CompanySetting::where('company_id', $ownCompany->id)->first()->settings['theme']['mode']);
        $this->assertSame('dark', CompanySetting::where('company_id', $otherCompany->id)->first()->settings['theme']['mode']);

        $this->putJson('/api/settings', [
            'company_id' => $otherCompany->id,
            'theme' => ['mode' => 'system'],
        ])->assertForbidden();
    }

    public function test_super_admin_can_use_global_or_company_settings(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->putJson('/api/settings', [
            'theme' => ['mode' => 'system'],
        ])->assertOk()->assertJsonPath('theme.mode', 'system');

        $this->putJson('/api/settings', [
            'company_id' => $company->id,
            'localization' => ['locale' => 'tr-TR', 'currency' => 'TRY'],
        ])->assertOk()->assertJsonPath('localization.currency', 'TRY');

        $this->assertSame('system', CompanySetting::whereNull('company_id')->first()->settings['theme']['mode']);
        $this->assertSame('TRY', CompanySetting::where('company_id', $company->id)->first()->settings['localization']['currency']);
    }

    public function test_webhook_disabled_does_not_dispatch_from_sync_notification(): void
    {
        Queue::fake();

        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $marketplace = MarketplaceAccount::create(['company_id' => $company->id, 'code' => 'trendyol', 'name' => 'Trendyol']);
        $syncRun = SyncRun::create(['marketplace_account_id' => $marketplace->id, 'type' => 'orders', 'status' => 'completed']);
        CompanySetting::create([
            'company_id' => $company->id,
            'settings' => [
                'webhooks' => ['enabled' => false, 'endpoint_url' => 'https://example.test/webhook', 'secret' => 'secret'],
            ],
        ]);

        app(SyncRunService::class)->notify($syncRun->fresh('marketplace'), 'success', 'Senkronizasyon tamamlandi', 'Tamamlandi.');

        Queue::assertNotPushed(DispatchWebhookNotificationJob::class);
        $this->assertDatabaseCount('webhook_delivery_logs', 0);
    }

    public function test_webhook_enabled_dispatches_sync_completed_or_failed_events(): void
    {
        Queue::fake();

        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $marketplace = MarketplaceAccount::create(['company_id' => $company->id, 'code' => 'trendyol', 'name' => 'Trendyol']);
        $syncRun = SyncRun::create(['marketplace_account_id' => $marketplace->id, 'type' => 'orders', 'status' => 'completed']);
        CompanySetting::create([
            'company_id' => $company->id,
            'settings' => [
                'notifications' => ['critical_only' => false],
                'webhooks' => ['enabled' => true, 'endpoint_url' => 'https://example.test/webhook', 'secret' => 'secret'],
            ],
        ]);

        app(SyncRunService::class)->notify($syncRun->fresh('marketplace'), 'success', 'Senkronizasyon tamamlandi', 'Tamamlandi.');

        Queue::assertPushed(DispatchWebhookNotificationJob::class, fn (DispatchWebhookNotificationJob $job) => $job->event === 'sync.completed'
            && $job->endpoint === 'https://example.test/webhook'
            && $job->payload['data']['sync_run_id'] === $syncRun->id);
        $this->assertDatabaseHas('webhook_delivery_logs', [
            'company_id' => $company->id,
            'event' => 'sync.completed',
            'endpoint' => 'https://example.test/webhook',
            'status' => 'queued',
            'success' => false,
        ]);

        Queue::fake();
        CompanySetting::where('company_id', $company->id)->update([
            'settings' => [
                'notifications' => ['critical_only' => true],
                'webhooks' => ['enabled' => true, 'endpoint_url' => 'https://example.test/webhook', 'secret' => 'secret'],
            ],
        ]);

        app(SyncRunService::class)->notify($syncRun->fresh('marketplace'), 'success', 'Senkronizasyon tamamlandi', 'Tamamlandi.');
        Queue::assertNotPushed(DispatchWebhookNotificationJob::class);

        app(SyncRunService::class)->notify($syncRun->fresh('marketplace'), 'error', 'Senkronizasyon basarisiz', 'Hata.');
        Queue::assertPushed(DispatchWebhookNotificationJob::class, fn (DispatchWebhookNotificationJob $job) => $job->event === 'sync.failed');
    }

    public function test_webhook_test_endpoint_sends_signed_request(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        CompanySetting::create([
            'company_id' => $company->id,
            'settings' => [
                'webhooks' => ['enabled' => true, 'endpoint_url' => 'https://example.test/webhook', 'secret' => 'secret'],
            ],
        ]);

        Http::fake(function ($request) {
            $body = $request->body();
            $this->assertSame('webhook.test', $request->header('X-Balina-Event')[0] ?? null);
            $this->assertSame(hash_hmac('sha256', $body, 'secret'), $request->header('X-Balina-Signature')[0] ?? null);
            $this->assertNotEmpty($request->header('X-Balina-Delivery')[0] ?? null);
            $this->assertSame('webhook.test', data_get(json_decode($body, true), 'event'));

            return Http::response(['ok' => true], 200);
        });

        $this->postJson('/api/settings/webhook-test')
            ->assertOk()
            ->assertJsonPath('message', 'Webhook test istegi basarili.');

        $this->assertDatabaseHas('webhook_delivery_logs', [
            'company_id' => $company->id,
            'event' => 'webhook.test',
            'endpoint' => 'https://example.test/webhook',
            'status' => 'delivered',
            'success' => true,
            'response_code' => 200,
        ]);
    }

    public function test_webhook_test_endpoint_keeps_tenant_isolation(): void
    {
        $ownCompany = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->postJson('/api/settings/webhook-test', ['company_id' => $otherCompany->id])->assertForbidden();
    }

    public function test_webhook_delivery_job_records_success_and_failed_attempts(): void
    {
        $company = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $delivery = WebhookDeliveryLog::create([
            'company_id' => $company->id,
            'delivery_id' => '11111111-1111-4111-8111-111111111111',
            'event' => 'sync.completed',
            'endpoint' => 'https://example.test/webhook',
            'payload' => ['api_key' => '******'],
        ]);

        Http::fake(['https://example.test/webhook' => Http::response(['accepted' => true], 202)]);

        (new DispatchWebhookNotificationJob($company->id, 'sync.completed', ['event' => 'sync.completed'], 'https://example.test/webhook', 'secret', $delivery->id))
            ->handle(app(\App\Services\Notifications\NotificationRuntimeService::class));

        $this->assertDatabaseHas('webhook_delivery_logs', [
            'id' => $delivery->id,
            'status' => 'delivered',
            'success' => true,
            'response_code' => 202,
        ]);

        $failed = WebhookDeliveryLog::create([
            'company_id' => $company->id,
            'delivery_id' => '22222222-2222-4222-8222-222222222222',
            'event' => 'sync.failed',
            'endpoint' => 'https://example.test/fail',
            'payload' => ['token' => '******'],
        ]);

        Http::fake(['https://example.test/fail' => Http::response(['error' => 'down'], 500)]);
        $job = new DispatchWebhookNotificationJob($company->id, 'sync.failed', ['event' => 'sync.failed'], 'https://example.test/fail', 'secret', $failed->id);

        try {
            $job->handle(app(\App\Services\Notifications\NotificationRuntimeService::class));
            $this->fail('Webhook job failure was not thrown.');
        } catch (\Throwable $exception) {
            $job->failed($exception);
        }

        $this->assertDatabaseHas('webhook_delivery_logs', [
            'id' => $failed->id,
            'status' => 'failed',
            'success' => false,
            'response_code' => 500,
            'last_error' => 'Webhook dispatch failed with HTTP 500',
        ]);
    }

    public function test_tenant_user_can_only_list_own_webhook_delivery_logs(): void
    {
        $ownCompany = Company::create(['name' => 'Tenant A', 'email' => 'a@example.test', 'is_active' => true]);
        $otherCompany = Company::create(['name' => 'Tenant B', 'email' => 'b@example.test', 'is_active' => true]);
        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        WebhookDeliveryLog::create([
            'company_id' => $ownCompany->id,
            'delivery_id' => '33333333-3333-4333-8333-333333333333',
            'event' => 'sync.completed',
            'endpoint' => 'https://example.test/own',
        ]);
        WebhookDeliveryLog::create([
            'company_id' => $otherCompany->id,
            'delivery_id' => '44444444-4444-4444-8444-444444444444',
            'event' => 'sync.completed',
            'endpoint' => 'https://example.test/other',
        ]);

        $this->getJson('/api/settings/webhook-deliveries')
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.endpoint', 'https://example.test/own');
    }
}
