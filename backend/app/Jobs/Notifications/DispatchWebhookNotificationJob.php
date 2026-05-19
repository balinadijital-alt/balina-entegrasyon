<?php

namespace App\Jobs\Notifications;

use App\Models\WebhookDeliveryLog;
use App\Services\Notifications\NotificationRuntimeService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Http\Client\Response;
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
        public ?int $deliveryLogId = null,
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
        $delivery = $this->deliveryLog();

        try {
            $response = Http::timeout(10)
                ->withBody($body, 'application/json')
                ->withHeaders($runtime->headers($this->event, $body, $this->secret))
                ->post($this->endpoint);

            if ($delivery) {
                $runtime->recordAttempt($delivery, $this->attempts(), $response);
            }

            if (! $response->successful()) {
                throw new \RuntimeException('Webhook dispatch failed with HTTP '.$response->status());
            }

            if ($delivery) {
                $runtime->markDelivered($delivery, $response);
            }
        } catch (Throwable $exception) {
            if ($delivery) {
                $runtime->recordAttempt($delivery, $this->attempts(), isset($response) && $response instanceof Response ? $response : null, $exception);
            }
            throw $exception;
        }
    }

    public function failed(Throwable $exception): void
    {
        if ($delivery = $this->deliveryLog()) {
            app(NotificationRuntimeService::class)->markFailed($delivery, $exception);
        }

        Log::warning('Webhook notification dispatch failed', [
            'company_id' => $this->companyId,
            'event' => $this->event,
            'endpoint' => $this->endpoint,
            'message' => $exception->getMessage(),
        ]);
    }

    private function deliveryLog(): ?WebhookDeliveryLog
    {
        return $this->deliveryLogId ? WebhookDeliveryLog::find($this->deliveryLogId) : null;
    }
}
