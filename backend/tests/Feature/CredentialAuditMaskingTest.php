<?php

namespace Tests\Feature;

use App\Models\AccountingAccount;
use App\Models\AccountingIntegration;
use App\Models\AuditLog;
use App\Models\Company;
use App\Models\MarketplaceAccount;
use App\Models\PaymentAccount;
use App\Models\PaymentProvider;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

class CredentialAuditMaskingTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['super_admin', 'company_admin'] as $role) {
            Role::firstOrCreate(['name' => $role, 'guard_name' => 'web']);
        }
    }

    public function test_payment_account_blank_secret_is_preserved_and_audit_is_masked(): void
    {
        $company = $this->company();
        $provider = PaymentProvider::firstOrCreate(
            ['code' => 'iyzico'],
            ['name' => 'Iyzico', 'service_class' => 'FakePaymentService', 'capabilities' => [], 'is_active' => true]
        );
        $account = PaymentAccount::create([
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Payment Account',
            'api_key' => 'old-key',
            'api_secret' => 'old-secret',
            'client_secret' => 'old-client-secret',
            'webhook_secret' => 'old-webhook-secret',
            'is_active' => true,
        ]);
        $actor = $this->user($company);

        $this->actingAs($actor)->putJson("/api/payment-accounts/{$account->id}", [
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Payment Account Updated',
            'api_key' => '',
            'api_secret' => '',
            'client_secret' => null,
            'webhook_secret' => '',
            'is_active' => true,
        ])->assertOk();

        $fresh = $account->fresh();
        $this->assertSame('old-key', $fresh->api_key);
        $this->assertSame('old-secret', $fresh->api_secret);
        $this->assertSame('old-client-secret', $fresh->client_secret);
        $this->assertSame('old-webhook-secret', $fresh->webhook_secret);
        $this->assertCredentialAuditIsMasked('payment_account.update', $company, $actor, [
            'old-key',
            'old-secret',
            'old-client-secret',
            'old-webhook-secret',
        ]);
    }

    public function test_marketplace_account_blank_secret_is_preserved_and_audit_is_masked(): void
    {
        $company = $this->company();
        $account = MarketplaceAccount::create([
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol',
            'supplier_id' => 'supplier-1',
            'api_key' => 'market-key',
            'api_secret' => 'market-secret',
            'service_password' => 'market-password',
            'is_active' => true,
        ]);
        $actor = $this->user($company);

        $this->actingAs($actor)->putJson("/api/marketplaces/{$account->id}", [
            'company_id' => $company->id,
            'code' => 'trendyol',
            'name' => 'Trendyol Updated',
            'supplier_id' => 'supplier-1',
            'api_key' => '',
            'api_secret' => null,
            'service_password' => '',
            'is_active' => true,
        ])->assertOk();

        $fresh = $account->fresh();
        $this->assertSame('market-key', $fresh->api_key);
        $this->assertSame('market-secret', $fresh->api_secret);
        $this->assertSame('market-password', $fresh->service_password);
        $this->assertCredentialAuditIsMasked('marketplace_account.update', $company, $actor, [
            'market-key',
            'market-secret',
            'market-password',
        ]);
    }

    public function test_shipping_account_blank_secret_is_preserved_and_audit_is_masked(): void
    {
        $company = $this->company();
        $carrier = ShippingCarrier::firstOrCreate(
            ['code' => 'aras'],
            ['name' => 'Aras', 'service_class' => 'FakeCargoService', 'capabilities' => [], 'is_active' => true]
        );
        $account = ShippingAccount::create([
            'company_id' => $company->id,
            'shipping_carrier_id' => $carrier->id,
            'name' => 'Shipping Account',
            'password' => 'ship-password',
            'api_key' => 'ship-key',
            'api_secret' => 'ship-secret',
            'is_active' => true,
        ]);
        $actor = $this->user($company);

        $this->actingAs($actor)->putJson("/api/shipping-accounts/{$account->id}", [
            'company_id' => $company->id,
            'shipping_carrier_id' => $carrier->id,
            'name' => 'Shipping Account Updated',
            'password' => '',
            'api_key' => null,
            'api_secret' => '',
            'is_active' => true,
        ])->assertOk();

        $fresh = $account->fresh();
        $this->assertSame('ship-password', $fresh->password);
        $this->assertSame('ship-key', $fresh->api_key);
        $this->assertSame('ship-secret', $fresh->api_secret);
        $this->assertCredentialAuditIsMasked('shipping_account.update', $company, $actor, [
            'ship-password',
            'ship-key',
            'ship-secret',
        ]);
    }

    public function test_accounting_account_blank_secret_is_preserved_and_audit_is_masked(): void
    {
        $company = $this->company();
        $integration = AccountingIntegration::firstOrCreate(
            ['code' => 'parasut'],
            ['name' => 'Parasut', 'service_class' => 'FakeAccountingService', 'capabilities' => [], 'is_active' => true]
        );
        $account = AccountingAccount::create([
            'company_id' => $company->id,
            'accounting_integration_id' => $integration->id,
            'name' => 'Accounting Account',
            'client_secret' => 'accounting-client-secret',
            'password' => 'accounting-password',
            'api_key' => 'accounting-key',
            'api_secret' => 'accounting-secret',
            'is_active' => true,
        ]);
        $actor = $this->user($company);

        $this->actingAs($actor)->putJson("/api/accounting-accounts/{$account->id}", [
            'company_id' => $company->id,
            'accounting_integration_id' => $integration->id,
            'name' => 'Accounting Account Updated',
            'client_secret' => '',
            'password' => null,
            'api_key' => '',
            'api_secret' => null,
            'is_active' => true,
        ])->assertOk();

        $fresh = $account->fresh();
        $this->assertSame('accounting-client-secret', $fresh->client_secret);
        $this->assertSame('accounting-password', $fresh->password);
        $this->assertSame('accounting-key', $fresh->api_key);
        $this->assertSame('accounting-secret', $fresh->api_secret);
        $this->assertCredentialAuditIsMasked('accounting_account.update', $company, $actor, [
            'accounting-client-secret',
            'accounting-password',
            'accounting-key',
            'accounting-secret',
        ]);
    }

    private function assertCredentialAuditIsMasked(string $action, Company $company, User $actor, array $forbiddenValues): void
    {
        $audit = AuditLog::query()
            ->where('module', 'credentials')
            ->where('action', $action)
            ->latest()
            ->firstOrFail();

        $this->assertSame($company->id, $audit->company_id);
        $this->assertSame($actor->id, $audit->user_id);

        $encoded = json_encode([
            'old' => $audit->old_values,
            'new' => $audit->new_values,
        ], JSON_UNESCAPED_UNICODE);

        $this->assertStringContainsString('********', $encoded);
        foreach ($forbiddenValues as $value) {
            $this->assertStringNotContainsString($value, $encoded);
        }
    }

    private function company(): Company
    {
        return Company::create([
            'name' => 'Company '.Str::random(8),
            'email' => Str::uuid().'@example.test',
            'is_active' => true,
        ]);
    }

    private function user(Company $company): User
    {
        $user = User::factory()->create(['company_id' => $company->id]);
        $user->assignRole('company_admin');

        return $user;
    }
}
