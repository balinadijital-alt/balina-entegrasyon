<?php

namespace App\Services\Notifications;

use App\Jobs\Notifications\DispatchWebhookNotificationJob;
use App\Http\Middleware\RequestCorrelationMiddleware;
use App\Models\CompanySetting;
use App\Models\WebhookDeliveryLog;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class NotificationRuntimeService
{
    private const SENSITIVE_KEYS = ['secret', 'token', 'password', 'api_key', 'api_secret', 'authorization', 'webhook_secret', 'key'];

    public function panelEnabled(?int $companyId): bool
    {
        return data_get($this->settings($companyId), 'notifications.panel_enabled', true) !== false;
    }

    public function dispatchWebhook(?int $companyId, string $event, string $level, array $payload): void
    {
        $settings = $this->settings($companyId);

        if (! $this->shouldDispatchWebhook($settings, $level)) {
            return;
        }

        $this->assertAllowedEndpoint((string) data_get($settings, 'webhooks.endpoint_url'));

        $delivery = $this->createDeliveryLog(
            $companyId,
            $event,
            (string) data_get($settings, 'webhooks.endpoint_url'),
            $this->payload($event, $level, $payload),
        );

        try {
            DispatchWebhookNotificationJob::dispatch(
                $companyId,
                $event,
                $this->payload($event, $level, $payload),
                (string) data_get($settings, 'webhooks.endpoint_url'),
                data_get($settings, 'webhooks.secret'),
                $delivery->id,
            )->onQueue('notifications');
        } catch (Throwable $exception) {
            $delivery->update([
                'status' => 'failed',
                'success' => false,
                'failed_at' => now(),
                'last_error' => $exception->getMessage(),
            ]);
            Log::warning('Webhook notification dispatch could not be queued', [
                'company_id' => $companyId,
                'event' => $event,
                'message' => $exception->getMessage(),
            ]);
        }
    }

    public function sendTest(?int $companyId): array
    {
        $settings = $this->settings($companyId);

        if (! data_get($settings, 'webhooks.enabled')) {
            throw new RuntimeException('Webhook aktif degil.');
        }

        $endpoint = (string) data_get($settings, 'webhooks.endpoint_url');

        if ($endpoint === '') {
            throw new RuntimeException('Webhook hedef URL bos.');
        }
        $this->assertAllowedEndpoint($endpoint);

        $payload = $this->payload('webhook.test', 'info', [
            'company_id' => $companyId,
            'message' => 'Balina webhook test bildirimi.',
        ]);
        $delivery = $this->createDeliveryLog($companyId, 'webhook.test', $endpoint, $payload);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        try {
            $response = Http::timeout(10)
                ->withBody($body, 'application/json')
                ->withHeaders($this->headers('webhook.test', $body, data_get($settings, 'webhooks.secret')))
                ->post($endpoint);

            $this->recordAttempt($delivery, 1, $response);

            if (! $response->successful()) {
                throw new RuntimeException('Webhook test istegi basarisiz oldu: HTTP '.$response->status());
            }

            $this->markDelivered($delivery, $response);
        } catch (Throwable $exception) {
            $this->markFailed($delivery, $exception);
            throw $exception;
        }

        return [
            'message' => 'Webhook test istegi basarili.',
            'status' => $response->status(),
        ];
    }

    public function headers(string $event, string $body, ?string $secret = null): array
    {
        return [
            'X-Balina-Event' => $event,
            'X-Balina-Signature' => $secret ? hash_hmac('sha256', $body, $secret) : '',
            'X-Balina-Delivery' => (string) Str::uuid(),
        ];
    }

    public function createDeliveryLog(?int $companyId, string $event, string $endpoint, array $payload): WebhookDeliveryLog
    {
        return WebhookDeliveryLog::create([
            'company_id' => $companyId,
            'delivery_id' => (string) Str::uuid(),
            'event' => $event,
            'endpoint' => $endpoint,
            'payload' => $this->maskPayload($payload),
            'status' => 'queued',
            'success' => false,
            'request_id' => request()?->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => request()?->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
        ]);
    }

    public function recordAttempt(WebhookDeliveryLog $delivery, int $attempts, ?Response $response = null, ?Throwable $exception = null): void
    {
        $delivery->update(array_filter([
            'attempts' => $attempts,
            'response_code' => $response?->status(),
            'response_body' => $response ? $this->responseBody($response) : null,
            'last_error' => $exception?->getMessage(),
        ], fn ($value) => $value !== null));
    }

    public function markDelivered(WebhookDeliveryLog $delivery, Response $response): void
    {
        $delivery->update([
            'status' => 'delivered',
            'success' => true,
            'response_code' => $response->status(),
            'response_body' => $this->responseBody($response),
            'delivered_at' => now(),
            'failed_at' => null,
            'last_error' => null,
        ]);
    }

    public function markFailed(WebhookDeliveryLog $delivery, Throwable $exception, ?Response $response = null): void
    {
        $delivery->update(array_filter([
            'status' => 'failed',
            'success' => false,
            'response_code' => $response?->status(),
            'response_body' => $response ? $this->responseBody($response) : null,
            'failed_at' => now(),
            'last_error' => $exception->getMessage(),
        ], fn ($value) => $value !== null));
    }

    private function shouldDispatchWebhook(array $settings, string $level): bool
    {
        if (! data_get($settings, 'webhooks.enabled') || ! data_get($settings, 'webhooks.endpoint_url')) {
            return false;
        }

        if (data_get($settings, 'notifications.critical_only') && ! in_array($level, ['failed', 'error'], true)) {
            return false;
        }

        return true;
    }

    private function assertAllowedEndpoint(string $endpoint): void
    {
        $parts = parse_url($endpoint);
        $scheme = strtolower((string) ($parts['scheme'] ?? ''));
        $host = strtolower((string) ($parts['host'] ?? ''));

        if ($scheme !== 'https' || $host === '') {
            throw new RuntimeException('Webhook endpoint HTTPS olmak zorunda.');
        }

        if ($host === 'localhost' || str_ends_with($host, '.localhost')) {
            throw new RuntimeException('Webhook endpoint localhost olamaz.');
        }

        if (in_array($host, ['169.254.169.254', 'metadata.google.internal'], true)) {
            throw new RuntimeException('Webhook endpoint metadata servisi olamaz.');
        }

        $ip = filter_var($host, FILTER_VALIDATE_IP) ? $host : null;
        if ($ip && ! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            throw new RuntimeException('Webhook endpoint private veya reserved IP olamaz.');
        }
    }

    private function payload(string $event, string $level, array $payload): array
    {
        return [
            'event' => $event,
            'level' => $level,
            'occurred_at' => now()->toISOString(),
            'data' => $payload,
        ];
    }

    private function settings(?int $companyId): array
    {
        return CompanySetting::query()
            ->where('company_id', $companyId)
            ->first()
            ?->settings ?? [];
    }

    private function maskPayload(mixed $payload, string $key = ''): mixed
    {
        if ($key !== '' && collect(self::SENSITIVE_KEYS)->contains(fn (string $pattern) => str_contains(strtolower($key), $pattern))) {
            return '******';
        }

        if (is_array($payload)) {
            return collect($payload)
                ->mapWithKeys(fn ($value, $childKey) => [$childKey => $this->maskPayload($value, (string) $childKey)])
                ->all();
        }

        return $payload;
    }

    private function responseBody(Response $response): array
    {
        $json = $response->json();

        if (is_array($json)) {
            return $this->maskPayload($json);
        }

        return ['body' => Str::limit($response->body(), 2000)];
    }
}
