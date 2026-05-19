<?php

namespace App\Services\Notifications;

use App\Jobs\Notifications\DispatchWebhookNotificationJob;
use App\Models\CompanySetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class NotificationRuntimeService
{
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

        try {
            DispatchWebhookNotificationJob::dispatch(
                $companyId,
                $event,
                $this->payload($event, $level, $payload),
                (string) data_get($settings, 'webhooks.endpoint_url'),
                data_get($settings, 'webhooks.secret'),
            )->onQueue('notifications');
        } catch (Throwable $exception) {
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

        $payload = $this->payload('webhook.test', 'info', [
            'company_id' => $companyId,
            'message' => 'Balina webhook test bildirimi.',
        ]);
        $body = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        $response = Http::timeout(10)
            ->withBody($body, 'application/json')
            ->withHeaders($this->headers('webhook.test', $body, data_get($settings, 'webhooks.secret')))
            ->post($endpoint);

        if (! $response->successful()) {
            throw new RuntimeException('Webhook test istegi basarisiz oldu: HTTP '.$response->status());
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
}
