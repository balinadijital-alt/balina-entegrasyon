<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\CompanySetting;
use App\Models\MarketplaceAccount;
use App\Models\SyncRun;
use App\Models\User;
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
}
