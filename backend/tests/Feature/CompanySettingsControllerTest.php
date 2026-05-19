<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\CompanySetting;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
