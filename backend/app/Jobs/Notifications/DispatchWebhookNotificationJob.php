<?php

namespace App\Jobs\Notifications;

use App\Services\Notifications\NotificationRuntimeService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class DispatchWebhookNotificationJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 30;

    public function __construct(
        public ?int $companyId,
        public string $event,
        public array $payload,
        public string $endpoint,
        public ?string $secret = null,
    ) {
        $this->onQueue('notifications');
    }

    public function backoff(): array
    {
        return [30, 120, 300];
    }

    public function handle(NotificationRuntimeService $runtime): void
    {
        $body = json_encode($this->payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        $response = Http::timeout(10)
            ->withBody($body, 'application/json')
            ->withHeaders($runtime->headers($this->event, $body, $this->secret))
            ->post($this->endpoint);

        if (! $response->successful()) {
            throw new \RuntimeException('Webhook dispatch failed with HTTP '.$response->status());
        }
    }

    public function failed(Throwable $exception): void
    {
        Log::warning('Webhook notification dispatch failed', [
            'company_id' => $this->companyId,
            'event' => $this->event,
            'endpoint' => $this->endpoint,
            'message' => $exception->getMessage(),
        ]);
    }
}
