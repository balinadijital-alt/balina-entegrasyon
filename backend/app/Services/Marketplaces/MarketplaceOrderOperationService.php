<?php

namespace App\Services\Marketplaces;

use App\Exceptions\MarketplaceApiException;
use App\Models\MarketplaceAccount;
use App\Models\MarketplaceOrderOperation;
use App\Models\Order;
use App\Models\OrderItem;
use Illuminate\Support\Facades\DB;

class MarketplaceOrderOperationService
{
    public function __construct(private readonly TrendyolService $trendyol)
    {
    }

    public function updatePackageStatus(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = (string) ($payload['shipmentPackageId'] ?? $payload['shipment_package_id'] ?? $order->provider_shipment_package_id);
        $status = (string) ($payload['status'] ?? '');
        $lines = $payload['lines'] ?? $this->defaultLines($order);

        if (! $shipmentPackageId || ! $status) {
            throw new MarketplaceApiException('shipmentPackageId ve status zorunludur.');
        }

        return DB::transaction(function () use ($account, $order, $payload, $shipmentPackageId, $status, $lines) {
            $operation = $this->createOperation($account, $order, null, 'package_status_update', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'status' => $status,
                'lines' => $lines,
            ] + $payload);

            if (! $this->liveWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_ORDER_OPS_CONFIRMED=false oldugu icin canli paket status guncellemesi gonderilmedi.');
            }

            try {
                $response = $this->trendyol->updatePackageStatus($account, $shipmentPackageId, $status, $lines);
                $operation->update(['status' => 'success', 'response_payload' => $response]);
                $order->update([
                    'provider_package_status' => $status,
                    'provider_status' => $status,
                    'shipping_status' => $this->normalizeLocalStatus($status),
                    'last_synced_at' => now(),
                ]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function cancelPackageItem(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = (string) ($payload['shipmentPackageId'] ?? $payload['shipment_package_id'] ?? $order->provider_shipment_package_id);
        $lineId = (string) ($payload['lineId'] ?? $payload['provider_line_id'] ?? '');
        $quantity = (int) ($payload['quantity'] ?? 1);
        $reasonId = (string) ($payload['reasonId'] ?? $payload['reason_id'] ?? '');
        $description = $payload['description'] ?? null;
        $item = $lineId ? $order->items()->where('provider_line_id', $lineId)->first() : null;

        if (! $shipmentPackageId || ! $lineId || $quantity < 1 || ! $reasonId) {
            throw new MarketplaceApiException('shipmentPackageId, lineId, quantity ve reasonId zorunludur.');
        }

        return DB::transaction(function () use ($account, $order, $payload, $shipmentPackageId, $lineId, $quantity, $reasonId, $description, $item) {
            $operation = $this->createOperation($account, $order, $item, 'cancel_package_item', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'lineId' => $lineId,
                'quantity' => $quantity,
                'reasonId' => $reasonId,
                'description' => $description,
            ] + $payload);

            if (! $this->liveWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_ORDER_OPS_CONFIRMED=false oldugu icin canli tedarik edememe bildirimi gonderilmedi.');
            }

            try {
                $response = $this->trendyol->cancelOrderPackageItem($account, $shipmentPackageId, $lineId, $quantity, $reasonId, $description);
                $operation->update(['status' => 'success', 'response_payload' => $response]);
                $item?->update(['provider_status' => 'cancelled', 'cancel_reason_id' => $reasonId]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    private function assertAccountOrder(MarketplaceAccount $account, Order $order): void
    {
        if ($account->code !== 'trendyol') {
            throw new MarketplaceApiException('Bu islem sadece Trendyol hesaplari icin kullanilabilir.');
        }

        if ((int) $account->company_id !== (int) $order->company_id || ((int) $order->marketplace_account_id !== 0 && (int) $order->marketplace_account_id !== (int) $account->id)) {
            throw new MarketplaceApiException('Siparis bu Trendyol magazasina ait degil.', 403);
        }
    }

    private function createOperation(MarketplaceAccount $account, Order $order, ?OrderItem $item, string $type, string $shipmentPackageId, array $payload): MarketplaceOrderOperation
    {
        return MarketplaceOrderOperation::create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'order_id' => $order->id,
            'order_item_id' => $item?->id,
            'provider_shipment_package_id' => $shipmentPackageId,
            'operation_type' => $type,
            'request_payload' => $payload,
            'status' => 'pending',
        ]);
    }

    private function markBlocked(MarketplaceOrderOperation $operation, string $message): MarketplaceOrderOperation
    {
        $operation->update([
            'status' => 'blocked',
            'error_code' => 'live_order_ops_disabled',
            'error_message' => $message,
            'response_payload' => ['dry_run' => true, 'message' => $message],
        ]);

        return $operation->fresh();
    }

    private function markFailed(MarketplaceOrderOperation $operation, MarketplaceApiException $exception): MarketplaceOrderOperation
    {
        $operation->update([
            'status' => 'failed',
            'error_code' => (string) ($exception->details['code'] ?? $exception->statusCode ?? 'provider_error'),
            'error_message' => $exception->getMessage(),
            'response_payload' => $exception->details,
        ]);

        return $operation->fresh();
    }

    private function liveWritesEnabled(): bool
    {
        return filter_var(env('TRENDYOL_LIVE_ORDER_OPS_CONFIRMED', false), FILTER_VALIDATE_BOOLEAN);
    }

    private function defaultLines(Order $order): array
    {
        return $order->items()
            ->get(['provider_line_id', 'quantity'])
            ->map(fn (OrderItem $item) => [
                'lineId' => (string) $item->provider_line_id,
                'quantity' => (int) $item->quantity,
            ])
            ->filter(fn (array $line) => filled($line['lineId']))
            ->values()
            ->all();
    }

    private function normalizeLocalStatus(string $status): string
    {
        return match (strtolower($status)) {
            'created', 'awaiting' => 'created',
            'picking', 'invoiced' => 'preparing',
            'shipped' => 'shipped',
            'delivered' => 'delivered',
            'cancelled', 'canceled', 'unsupplied' => 'cancelled',
            'returned', 'undelivered' => 'returned',
            default => strtolower($status),
        };
    }
}
