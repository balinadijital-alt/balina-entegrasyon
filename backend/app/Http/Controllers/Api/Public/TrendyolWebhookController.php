<?php

namespace App\Http\Controllers\Api\Public;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequestCorrelationMiddleware;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\TrendyolService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class TrendyolWebhookController extends Controller
{
    private const EVENT = 'trendyol.packages';
    private const MAX_PAYLOAD_BYTES = 262144;
    private const TIMESTAMP_TOLERANCE_SECONDS = 300;

    private const SENSITIVE_KEYS = [
        'secret',
        'token',
        'password',
        'api_key',
        'api_secret',
        'authorization',
        'webhook_secret',
        'key',
        'signature',
    ];

    public function packages(Request $request, TrendyolService $service): JsonResponse
    {
        $rawBody = $request->getContent();
        $bodyHash = hash('sha256', $rawBody);
        $deliveryId = $this->deliveryId($request);

        if (! $request->isJson()) {
            $this->recordDelivery($this->unknownIdempotencyKey($bodyHash), $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'invalid_content_type',
                'body_sha256' => $bodyHash,
                'last_error' => 'Content-Type application/json olmali.',
            ]));

            return response()->json(['message' => 'Webhook content type gecersiz.'], 415);
        }

        if (strlen($rawBody) > self::MAX_PAYLOAD_BYTES) {
            $this->recordDelivery($this->unknownIdempotencyKey($bodyHash), $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'payload_too_large',
                'body_sha256' => $bodyHash,
                'last_error' => 'Webhook payload limiti asildi.',
            ]));

            return response()->json(['message' => 'Webhook payload cok buyuk.'], 413);
        }

        $payload = $this->payload($rawBody);
        if ($payload === null) {
            $this->recordDelivery($this->unknownIdempotencyKey($bodyHash), $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'invalid_json',
                'body_sha256' => $bodyHash,
                'last_error' => 'Webhook JSON parse edilemedi.',
            ]));

            return response()->json(['message' => 'Webhook JSON gecersiz.'], 400);
        }

        $supplierId = $this->supplierId($payload);
        $idempotencyKey = $this->idempotencyKey($supplierId, $payload, $bodyHash);
        $businessEventKey = $this->businessEventKey($supplierId, $payload);
        $providerTimestamp = $this->providerTimestamp($request);

        if (! $providerTimestamp || ! $this->timestampWithinWindow($providerTimestamp)) {
            $this->recordDelivery($idempotencyKey, $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'expired_signature',
                'payload' => $this->mask($payload),
                'business_event_key' => $businessEventKey,
                'body_sha256' => $bodyHash,
                'provider_timestamp' => $providerTimestamp,
                'last_error' => $providerTimestamp ? 'Webhook timestamp tolerans disinda.' : 'Webhook timestamp eksik veya gecersiz.',
            ]));

            return response()->json(['message' => 'Webhook timestamp gecersiz.'], 401);
        }

        if (! $supplierId) {
            $this->recordDelivery($idempotencyKey, $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'unknown_account',
                'payload' => $this->mask($payload),
                'business_event_key' => $businessEventKey,
                'body_sha256' => $bodyHash,
                'provider_timestamp' => $providerTimestamp,
                'last_error' => 'Supplier ID bulunamadi.',
            ]));

            return response()->json(['message' => 'Webhook alindi.'], 202);
        }

        $account = MarketplaceAccount::query()
            ->where('code', 'trendyol')
            ->where('supplier_id', $supplierId)
            ->where('is_active', true)
            ->first();

        if (! $account) {
            $this->recordDelivery($idempotencyKey, $this->deliveryContext($request, [
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'unknown_account',
                'payload' => $this->mask($payload),
                'business_event_key' => $businessEventKey,
                'body_sha256' => $bodyHash,
                'provider_timestamp' => $providerTimestamp,
                'last_error' => "Aktif Trendyol hesabi bulunamadi: {$supplierId}",
            ]));

            return response()->json(['message' => 'Webhook alindi.'], 202);
        }

        $signature = $this->signature($request);
        $secret = (string) data_get($account->metadata, 'webhook_secret', '');

        if (! $this->validSignature($rawBody, $signature, $secret)) {
            $this->recordDelivery($idempotencyKey, $this->deliveryContext($request, [
                'company_id' => $account->company_id,
                'marketplace_account_id' => $account->id,
                'marketplace_code' => 'trendyol',
                'delivery_id' => $deliveryId,
                'event' => self::EVENT,
                'status' => 'invalid_signature',
                'payload' => $this->mask($payload),
                'signature_valid' => false,
                'business_event_key' => $businessEventKey,
                'body_sha256' => $bodyHash,
                'provider_timestamp' => $providerTimestamp,
                'last_error' => $secret ? 'Webhook signature gecersiz.' : 'Webhook secret tanimli degil.',
            ]));

            return response()->json(['message' => 'Webhook signature gecersiz.'], 401);
        }

        $request->merge(['company_id' => $account->company_id]);
        $existing = InboundWebhookDelivery::where('idempotency_key', $idempotencyKey)->first();
        $businessReplay = InboundWebhookDelivery::query()
            ->where('business_event_key', $businessEventKey)
            ->whereIn('status', ['processed', 'duplicate'])
            ->first();

        if (($existing && in_array($existing->status, ['processed', 'duplicate'], true)) || $businessReplay) {
            $duplicate = $existing ?: $businessReplay;
            $duplicate->update([
                'status' => 'duplicate',
                'last_error' => 'Duplicate webhook delivery ignored.',
            ]);

            return response()->json(['message' => 'Webhook daha once islendi.', 'duplicate' => true]);
        }

        $delivery = $existing ?: InboundWebhookDelivery::create([
            'company_id' => $account->company_id,
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'delivery_id' => $deliveryId,
            'idempotency_key' => $idempotencyKey,
            'event' => self::EVENT,
            'status' => 'received',
            'payload' => $this->mask($payload),
            'signature_valid' => true,
            'business_event_key' => $businessEventKey,
            'body_sha256' => $bodyHash,
            'source_ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
            'provider_timestamp' => $providerTimestamp,
            'received_at' => now(),
            'request_id' => $request->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => $request->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
        ]);

        try {
            $result = $service->webhookPackages($account, $payload);

            $delivery->update([
                'company_id' => $account->company_id,
                'marketplace_account_id' => $account->id,
                'status' => 'processed',
                'signature_valid' => true,
                'processed_at' => now(),
                'last_error' => null,
            ]);

            return response()->json([
                'message' => 'Webhook islendi.',
                'result' => $result,
            ], 202);
        } catch (Throwable $exception) {
            $delivery->update([
                'status' => 'failed',
                'signature_valid' => true,
                'last_error' => $exception->getMessage(),
            ]);

            Log::warning('trendyol.webhook.failed', [
                'delivery_id' => $delivery->id,
                'supplier_id' => $supplierId,
                'message' => $exception->getMessage(),
            ]);

            return response()->json(['message' => 'Webhook islenemedi.'], 500);
        }
    }

    private function payload(string $rawBody): ?array
    {
        $payload = json_decode($rawBody, true);

        return is_array($payload) ? $payload : null;
    }

    private function recordDelivery(string $idempotencyKey, array $values): InboundWebhookDelivery
    {
        $existing = InboundWebhookDelivery::where('idempotency_key', $idempotencyKey)->first();

        if ($existing && in_array($existing->status, ['processed', 'duplicate'], true)) {
            return $existing;
        }

        if ($existing) {
            $existing->update($values);

            return $existing;
        }

        return InboundWebhookDelivery::create(['idempotency_key' => $idempotencyKey] + $values);
    }

    private function supplierId(array $payload): ?string
    {
        foreach ([
            'supplierId',
            'supplier_id',
            'sellerId',
            'seller_id',
            'content.0.supplierId',
            'content.0.supplier_id',
            'content.0.sellerId',
            'content.0.seller_id',
            'packages.0.supplierId',
            'packages.0.supplier_id',
            'packages.0.sellerId',
            'packages.0.seller_id',
        ] as $key) {
            $value = data_get($payload, $key);

            if (filled($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    private function deliveryId(Request $request): ?string
    {
        return $request->header('X-Trendyol-Delivery')
            ?: $request->header('X-Delivery-Id')
            ?: $request->header('X-Balina-Delivery');
    }

    private function idempotencyKey(?string $supplierId, array $payload, string $bodyHash): string
    {
        $orderId = $this->firstFilled($payload, [
            'orderNumber',
            'packageNumber',
            'id',
            'content.0.orderNumber',
            'content.0.packageNumber',
            'content.0.id',
            'packages.0.orderNumber',
            'packages.0.packageNumber',
            'packages.0.id',
        ]);

        return hash('sha256', implode('|', [
            'trendyol',
            $supplierId ?: 'unknown',
            $orderId ?: 'no-order-id',
            $bodyHash,
        ]));
    }

    private function businessEventKey(?string $supplierId, array $payload): string
    {
        $orderId = $this->firstFilled($payload, [
            'orderNumber',
            'packageNumber',
            'id',
            'content.0.orderNumber',
            'content.0.packageNumber',
            'content.0.id',
            'packages.0.orderNumber',
            'packages.0.packageNumber',
            'packages.0.id',
        ]);

        return hash('sha256', implode('|', [
            'trendyol',
            $supplierId ?: 'unknown',
            $orderId ?: 'no-order-id',
        ]));
    }

    private function unknownIdempotencyKey(string $bodyHash): string
    {
        return hash('sha256', "trendyol|unknown|invalid|{$bodyHash}");
    }

    private function firstFilled(array $payload, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = data_get($payload, $key);

            if (filled($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    private function signature(Request $request): ?string
    {
        return $request->header('X-Balina-Signature')
            ?: $request->header('X-Trendyol-Signature')
            ?: $request->header('X-Signature');
    }

    private function validSignature(string $rawBody, ?string $signature, string $secret): bool
    {
        if (! $signature || ! $secret) {
            return false;
        }

        $expected = hash_hmac('sha256', $rawBody, $secret);
        $given = Str::startsWith($signature, 'sha256=')
            ? Str::after($signature, 'sha256=')
            : $signature;

        return hash_equals($expected, $given);
    }

    private function providerTimestamp(Request $request): ?CarbonImmutable
    {
        $value = $request->header('X-Timestamp')
            ?: $request->header('X-Balina-Timestamp')
            ?: $request->header('X-Trendyol-Timestamp');

        if (! $value) {
            return null;
        }

        try {
            return is_numeric($value)
                ? CarbonImmutable::createFromTimestamp((int) $value)
                : CarbonImmutable::parse($value);
        } catch (Throwable) {
            return null;
        }
    }

    private function timestampWithinWindow(CarbonImmutable $timestamp): bool
    {
        $now = CarbonImmutable::now();

        return $timestamp->greaterThanOrEqualTo($now->subSeconds(self::TIMESTAMP_TOLERANCE_SECONDS))
            && $timestamp->lessThanOrEqualTo($now->addSeconds(self::TIMESTAMP_TOLERANCE_SECONDS));
    }

    private function deliveryContext(Request $request, array $values): array
    {
        return $values + [
            'source_ip' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
            'received_at' => now(),
            'request_id' => $request->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => $request->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
        ];
    }

    private function mask(mixed $value): mixed
    {
        if (is_array($value)) {
            return collect($value)
                ->mapWithKeys(fn ($item, $key) => [
                    $key => $this->isSensitive((string) $key) ? '******' : $this->mask($item),
                ])
                ->all();
        }

        return $value;
    }

    private function isSensitive(string $key): bool
    {
        return Arr::first(self::SENSITIVE_KEYS, fn (string $needle) => str_contains(strtolower($key), $needle)) !== null;
    }
}
