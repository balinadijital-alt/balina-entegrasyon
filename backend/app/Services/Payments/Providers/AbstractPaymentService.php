<?php

namespace App\Services\Payments\Providers;

use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Http\Middleware\RequestCorrelationMiddleware;
use App\Services\Payments\Contracts\PaymentProvider;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

abstract class AbstractPaymentService implements PaymentProvider
{
    abstract protected function code(): string;

    public function create(Payment $payment, array $payload = []): array
    {
        $request = $this->payload($payment, $payload);
        $response = $this->send($payment, 'create', $request);

        return [
            'status' => data_get($response, 'status', 'pending'),
            'transaction_id' => data_get($response, 'transaction_id', data_get($response, 'paymentId')),
            'payment_url' => data_get($response, 'payment_url', data_get($response, 'checkoutUrl')),
            'request_payload' => $request,
            'response_payload' => $response,
        ];
    }

    public function startThreeDSecure(Payment $payment, array $payload = []): array
    {
        $request = $this->payload($payment, $payload);
        $response = $this->send($payment, 'three_d_start', $request);

        return [
            'status' => 'three_d_pending',
            'transaction_id' => data_get($response, 'transaction_id', data_get($response, 'paymentId')),
            'payment_url' => data_get($response, 'payment_url', data_get($response, 'threeDUrl')),
            'three_d_html' => data_get($response, 'three_d_html', data_get($response, 'html')),
            'request_payload' => $request,
            'response_payload' => $response,
        ];
    }

    public function verifyCallback(Payment $payment, array $payload, ?string $signature = null, ?string $rawBody = null): bool
    {
        $secret = $payment->account?->webhook_secret ?: $payment->account?->api_secret;

        if (! $secret) {
            return ! (app()->environment('production') || config('app.env') === 'production');
        }

        $body = $rawBody !== null && $rawBody !== ''
            ? $rawBody
            : json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $expected = hash_hmac('sha256', (string) $body, $secret);
        $given = Str::startsWith((string) $signature, 'sha256=')
            ? Str::after((string) $signature, 'sha256=')
            : (string) $signature;

        return hash_equals($expected, $given);
    }

    public function query(Payment $payment): array
    {
        $response = $this->send($payment, 'query', [
            'conversation_id' => $payment->conversation_id,
            'transaction_id' => $payment->transaction_id,
        ]);

        return [
            'status' => data_get($response, 'status', $payment->status),
            'response_payload' => $response,
            'paid_at' => data_get($response, 'status') === 'paid' ? now() : $payment->paid_at,
            'failed_at' => data_get($response, 'status') === 'failed' ? now() : $payment->failed_at,
        ];
    }

    public function refund(Payment $payment, float $amount, array $payload = []): array
    {
        $response = $this->send($payment, 'refund', ['amount' => $amount, 'transaction_id' => $payment->transaction_id] + $payload);
        $refunded = (float) $payment->refunded_amount + $amount;

        return [
            'status' => $refunded >= (float) $payment->amount ? 'refunded' : 'partially_refunded',
            'refunded_amount' => $refunded,
            'response_payload' => $response,
        ];
    }

    protected function send(Payment $payment, string $action, array $payload): array
    {
        $account = $payment->account()->with('provider')->firstOrFail();
        $endpoint = data_get($account->settings, "endpoints.{$action}");
        $startedAt = microtime(true);

        if (! $account->base_url || ! $endpoint) {
            $response = [
                'mock' => true,
                'status' => $action === 'query' ? 'paid' : 'pending',
                'transaction_id' => $payment->transaction_id ?: strtoupper($this->code()).'-'.Str::uuid(),
                'payment_url' => url("/payment/mock/{$payment->id}"),
            ];
            $this->log($payment, $action, $payload, $response, null, $startedAt);

            return $response;
        }

        try {
            $pending = Http::baseUrl($account->base_url)
                ->timeout((int) data_get($account->settings, 'timeout', 30))
                ->retry(3, 750, throw: false)
                ->acceptJson()
                ->withHeaders(array_filter([
                    'X-Api-Key' => $account->api_key,
                    'X-Client-Id' => $account->client_id,
                    'User-Agent' => 'Balina-Entegrasyon/1.0',
                ]));

            /** @var Response $http */
            $http = $pending->post($endpoint, $payload);
            $json = $http->json() ?? [];
            $this->log($payment, $action, $payload, $json, null, $startedAt);

            if (! $http->successful()) {
                throw new RuntimeException(data_get($json, 'message') ?: 'Odeme API istegi basarisiz oldu.');
            }

            return $json;
        } catch (Throwable $exception) {
            $this->log($payment, $action, $payload, null, $exception->getMessage(), $startedAt);
            throw $exception;
        }
    }

    protected function payload(Payment $payment, array $payload): array
    {
        $order = $payment->order;

        return [
            'conversation_id' => $payment->conversation_id,
            'order_id' => $order->id,
            'marketplace_order_id' => $order->marketplace_order_id,
            'amount' => (float) $payment->amount,
            'currency' => $payment->currency,
            'installment_count' => $payment->installment_count,
            'customer' => ['name' => $order->customer_name, 'email' => $order->customer_email],
            'callback_url' => url("/api/payment-callbacks/{$payment->id}"),
            'options' => $payload,
        ];
    }

    protected function log(Payment $payment, string $event, array $request, mixed $response, ?string $error, float $startedAt): void
    {
        PaymentLog::create([
            'payment_id' => $payment->id,
            'payment_account_id' => $payment->payment_account_id,
            'provider_code' => $payment->provider_code,
            'event' => $event,
            'status' => $payment->status,
            'request_payload' => $this->maskPayload($request),
            'response_payload' => is_array($response) ? $this->maskPayload($response) : null,
            'error_message' => $error,
            'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            'request_id' => request()?->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => request()?->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
        ]);
    }

    protected function maskPayload(mixed $payload, string $key = ''): mixed
    {
        if ($key !== '' && collect(['secret', 'token', 'password', 'api_key', 'api_secret', 'authorization', 'webhook_secret', 'key', 'three_d_html'])->contains(fn (string $pattern) => str_contains(strtolower($key), $pattern))) {
            return '******';
        }

        if (is_array($payload)) {
            return collect($payload)
                ->mapWithKeys(fn ($value, $childKey) => [$childKey => $this->maskPayload($value, (string) $childKey)])
                ->all();
        }

        return $payload;
    }
}
