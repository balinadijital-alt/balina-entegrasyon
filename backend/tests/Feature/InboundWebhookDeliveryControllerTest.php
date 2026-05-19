<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class InboundWebhookDeliveryControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(DatabaseSeeder::class);
    }

    public function test_tenant_lists_only_own_inbound_webhook_deliveries(): void
    {
        [$ownCompany, $ownAccount] = $this->companyWithAccount('Tenant A', '111111');
        [$otherCompany, $otherAccount] = $this->companyWithAccount('Tenant B', '222222');
        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $own = $this->delivery($ownCompany, $ownAccount, ['delivery_id' => 'own-delivery']);
        $this->delivery($otherCompany, $otherAccount, ['delivery_id' => 'other-delivery']);

        $this->getJson('/api/inbound-webhook-deliveries')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $own->id)
            ->assertJsonPath('data.0.company.name', 'Tenant A')
            ->assertJsonPath('data.0.marketplace_account.name', 'Trendyol Tenant A');
    }

    public function test_tenant_cannot_filter_into_another_company(): void
    {
        [$ownCompany, $ownAccount] = $this->companyWithAccount('Tenant A', '111111');
        [$otherCompany, $otherAccount] = $this->companyWithAccount('Tenant B', '222222');
        $user = User::factory()->create(['company_id' => $ownCompany->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $this->delivery($ownCompany, $ownAccount);
        $this->delivery($otherCompany, $otherAccount);

        $this->getJson("/api/inbound-webhook-deliveries?company_id={$otherCompany->id}")
            ->assertForbidden();
    }

    public function test_super_admin_sees_all_deliveries(): void
    {
        [$firstCompany, $firstAccount] = $this->companyWithAccount('Tenant A', '111111');
        [$secondCompany, $secondAccount] = $this->companyWithAccount('Tenant B', '222222');
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->delivery($firstCompany, $firstAccount);
        $this->delivery($secondCompany, $secondAccount);

        $this->getJson('/api/inbound-webhook-deliveries')
            ->assertOk()
            ->assertJsonCount(2, 'data');
    }

    public function test_company_filter_works_for_super_admin(): void
    {
        [$firstCompany, $firstAccount] = $this->companyWithAccount('Tenant A', '111111');
        [$secondCompany, $secondAccount] = $this->companyWithAccount('Tenant B', '222222');
        $user = User::factory()->create();
        $user->assignRole('super_admin');
        Sanctum::actingAs($user);

        $this->delivery($firstCompany, $firstAccount, ['delivery_id' => 'first']);
        $second = $this->delivery($secondCompany, $secondAccount, ['delivery_id' => 'second']);

        $this->getJson("/api/inbound-webhook-deliveries?company_id={$secondCompany->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $second->id);
    }

    public function test_status_filter_works(): void
    {
        [$company, $account] = $this->companyWithAccount('Tenant A', '111111');
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $processed = $this->delivery($company, $account, ['status' => 'processed']);
        $this->delivery($company, $account, ['status' => 'failed']);

        $this->getJson('/api/inbound-webhook-deliveries?status=processed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $processed->id);
    }

    public function test_signature_valid_filter_works(): void
    {
        [$company, $account] = $this->companyWithAccount('Tenant A', '111111');
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $valid = $this->delivery($company, $account, ['signature_valid' => true]);
        $this->delivery($company, $account, ['signature_valid' => false]);

        $this->getJson('/api/inbound-webhook-deliveries?signature_valid=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $valid->id);
    }

    public function test_search_filter_matches_delivery_id_idempotency_key_event_and_error(): void
    {
        [$company, $account] = $this->companyWithAccount('Tenant A', '111111');
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');
        Sanctum::actingAs($user);

        $deliveryId = $this->delivery($company, $account, ['delivery_id' => 'match-delivery']);
        $idempotency = $this->delivery($company, $account, ['idempotency_key' => 'match-idempotency']);
        $event = $this->delivery($company, $account, ['event' => 'match.event']);
        $error = $this->delivery($company, $account, ['last_error' => 'match error text']);
        $this->delivery($company, $account, ['delivery_id' => 'other']);

        $this->getJson('/api/inbound-webhook-deliveries?search=match')
            ->assertOk()
            ->assertJsonCount(4, 'data')
            ->assertJsonFragment(['id' => $deliveryId->id])
            ->assertJsonFragment(['id' => $idempotency->id])
            ->assertJsonFragment(['id' => $event->id])
            ->assertJsonFragment(['id' => $error->id]);
    }

    private function companyWithAccount(string $companyName, string $supplierId): array
    {
        $company = Company::create([
            'name' => $companyName,
            'email' => strtolower(str_replace(' ', '-', $companyName)).'@example.test',
            'is_active' => true,
        ]);

        $account = MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => "Trendyol {$companyName}",
            'supplier_id' => $supplierId,
            'is_active' => true,
        ]);

        return [$company, $account];
    }

    private function delivery(Company $company, MarketplaceAccount $account, array $attributes = []): InboundWebhookDelivery
    {
        return InboundWebhookDelivery::create(array_merge([
            'company_id' => $company->id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'delivery_id' => 'delivery-'.uniqid(),
            'idempotency_key' => 'idempotency-'.uniqid(),
            'event' => 'trendyol.packages',
            'status' => 'processed',
            'payload' => ['packages' => [['token' => '******']]],
            'signature_valid' => true,
            'processed_at' => now(),
        ], $attributes));
    }
}
