<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Models\PaymentProvider;
use App\Services\Payments\Providers\OfflinePaymentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class PaymentCallbackHardeningTest extends TestCase
{
    use RefreshDatabase;

    public function test_get_callback_is_rejected(): void
    {
        $payment = $this->payment();

        $this->getJson("/api/payment-callbacks/{$payment->id}")->assertStatus(405);
    }

    public function test_missing_secret_is_rejected_in_production(): void
    {
        config(['app.env' => 'production']);
        $payment = $this->payment(webhookSecret: null);
        $body = json_encode(['status' => 'paid', 'transaction_id' => 'TX-1'], JSON_UNESCAPED_SLASHES);

        $this->postRaw($payment, $body, 'sha256='.hash_hmac('sha256', $body, 'wrong-secret'))
            ->assertForbidden();

        $this->assertDatabaseHas('payment_logs', ['payment_id' => $payment->id, 'status' => 'rejected', 'signature_valid' => false]);
    }

    public function test_invalid_signature_is_rejected(): void
    {
        $payment = $this->payment();
        $body = json_encode(['status' => 'paid', 'transaction_id' => 'TX-1'], JSON_UNESCAPED_SLASHES);

        $this->postRaw($payment, $body, 'sha256=invalid')->assertForbidden();

        $this->assertDatabaseHas('payment_logs', ['payment_id' => $payment->id, 'status' => 'rejected', 'signature_valid' => false]);
    }

    public function test_replayed_callback_is_ignored(): void
    {
        $payment = $this->payment();
        $body = json_encode(['status' => 'paid', 'transaction_id' => 'TX-1'], JSON_UNESCAPED_SLASHES);
        $signature = 'sha256='.hash_hmac('sha256', $body, 'callback-secret');

        $this->postRaw($payment, $body, $signature)->assertOk();
        $this->postRaw($payment, $body, $signature)
            ->assertOk()
            ->assertJsonPath('duplicate', true);

        $this->assertDatabaseCount('payment_logs', 1);
        $this->assertSame('paid', $payment->fresh()->status);
    }

    public function test_invalid_status_is_rejected(): void
    {
        $payment = $this->payment();
        $body = json_encode(['status' => 'admin_override', 'transaction_id' => 'TX-1'], JSON_UNESCAPED_SLASHES);

        $this->postRaw($payment, $body, 'sha256='.hash_hmac('sha256', $body, 'callback-secret'))
            ->assertStatus(422);

        $this->assertDatabaseHas('payment_logs', ['payment_id' => $payment->id, 'status' => 'rejected', 'signature_valid' => true]);
    }

    public function test_callback_payload_is_masked(): void
    {
        $payment = $this->payment();
        $body = json_encode(['status' => 'paid', 'transaction_id' => 'TX-1', 'token' => 'plain-token'], JSON_UNESCAPED_SLASHES);

        $this->postRaw($payment, $body, 'sha256='.hash_hmac('sha256', $body, 'callback-secret'))->assertOk();

        $log = PaymentLog::firstOrFail();
        $this->assertSame('******', $log->request_payload['token']);
    }

    private function postRaw(Payment $payment, string $body, string $signature)
    {
        return $this->call('POST', "/api/payment-callbacks/{$payment->id}", [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_TIMESTAMP' => (string) now()->timestamp,
            'HTTP_X_SIGNATURE' => $signature,
        ], $body);
    }

    private function payment(?string $webhookSecret = 'callback-secret'): Payment
    {
        $company = Company::create(['name' => 'Tenant '.Str::random(5), 'email' => Str::uuid().'@example.test', 'is_active' => true]);
        $provider = PaymentProvider::firstOrCreate(
            ['code' => 'offline'],
            ['name' => 'Offline', 'service_class' => OfflinePaymentService::class, 'capabilities' => [], 'is_active' => true]
        );
        $provider->forceFill(['service_class' => OfflinePaymentService::class])->save();
        $account = PaymentAccount::create([
            'company_id' => $company->id,
            'payment_provider_id' => $provider->id,
            'name' => 'Offline POS',
            'webhook_secret' => $webhookSecret,
            'is_active' => true,
        ]);
        $order = Order::create([
            'company_id' => $company->id,
            'marketplace_code' => 'manual',
            'marketplace_order_id' => (string) Str::uuid(),
            'customer_name' => 'Customer',
            'total_amount' => 100,
            'status' => 'new',
        ]);

        return Payment::create([
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'provider_code' => 'offline',
            'method' => 'card',
            'status' => 'pending',
            'amount' => 100,
        ]);
    }
}
