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

    public function orderForPackage(MarketplaceAccount $account, string $shipmentPackageId): Order
    {
        $order = Order::query()
            ->where('company_id', $account->company_id)
            ->where('marketplace_code', 'trendyol')
            ->where('provider_shipment_package_id', $shipmentPackageId)
            ->when($account->id, fn ($query) => $query->where(function ($inner) use ($account) {
                $inner->whereNull('marketplace_account_id')
                    ->orWhere('marketplace_account_id', $account->id);
            }))
            ->latest('id')
            ->first();

        if (! $order) {
            throw new MarketplaceApiException('Bu paket ID icin Trendyol siparisi bulunamadi.', 404);
        }

        return $order;
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

    public function sendInvoiceLink(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);
        $invoiceLink = (string) ($payload['invoiceLink'] ?? $payload['invoice_link'] ?? '');

        if (! $shipmentPackageId || ! filter_var($invoiceLink, FILTER_VALIDATE_URL)) {
            throw new MarketplaceApiException('shipmentPackageId ve gecerli invoiceLink zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId, $invoiceLink) {
            $operation = $this->createOperation($account, $order, null, 'invoice_link_send', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'invoiceLink' => $invoiceLink,
            ]);

            if (! $this->liveInvoiceWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED=false oldugu icin canli fatura linki gonderilmedi.', 'live_invoice_ops_disabled');
            }

            try {
                $response = $this->trendyol->sendInvoiceLink($account, $shipmentPackageId, $invoiceLink);
                $operation->update(['status' => 'success', 'response_payload' => $this->maskInvoicePayload($response)]);
                $order->update(['invoice_status' => 'sent', 'last_synced_at' => now()]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function deleteInvoiceLink(MarketplaceAccount $account, Order $order, array $payload = []): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);

        if (! $shipmentPackageId) {
            throw new MarketplaceApiException('shipmentPackageId zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId) {
            $operation = $this->createOperation($account, $order, null, 'invoice_link_delete', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
            ]);

            if (! $this->liveInvoiceWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED=false oldugu icin canli fatura linki silinmedi.', 'live_invoice_ops_disabled');
            }

            try {
                $response = $this->trendyol->deleteInvoiceLink($account, $shipmentPackageId);
                $operation->update(['status' => 'success', 'response_payload' => $this->maskInvoicePayload($response)]);
                $order->update(['invoice_status' => 'link_deleted', 'last_synced_at' => now()]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function sendInvoiceFile(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);
        $fileName = (string) ($payload['fileName'] ?? $payload['file_name'] ?? '');
        $fileContent = (string) ($payload['fileContent'] ?? $payload['file_content_base64'] ?? '');

        if (! $shipmentPackageId || $fileName === '' || $fileContent === '' || base64_decode($fileContent, true) === false) {
            throw new MarketplaceApiException('shipmentPackageId, fileName ve gecerli base64 fileContent zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId, $fileName, $fileContent) {
            $operation = $this->createOperation($account, $order, null, 'invoice_file_upload', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'fileName' => $fileName,
                'fileContent' => $fileContent,
            ]);

            if (! $this->liveInvoiceWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED=false oldugu icin canli fatura dosyasi yuklenmedi.', 'live_invoice_ops_disabled');
            }

            try {
                $response = $this->trendyol->sendInvoiceFile($account, $shipmentPackageId, $fileName, $fileContent);
                $operation->update(['status' => 'success', 'response_payload' => $this->maskInvoicePayload($response)]);
                $order->update(['invoice_status' => 'sent', 'last_synced_at' => now()]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function updateBoxInfo(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);
        $boxPayload = $this->boxInfoPayload($payload);

        if (! $shipmentPackageId || $boxPayload === []) {
            throw new MarketplaceApiException('shipmentPackageId ve en az bir desi/koli/agirluk bilgisi zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId, $boxPayload) {
            $operation = $this->createOperation($account, $order, null, 'cargo_box_info_update', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'boxInfo' => $boxPayload,
            ]);

            if (! $this->liveCargoWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_CARGO_OPS_CONFIRMED=false oldugu icin canli desi/koli bilgisi gonderilmedi.', 'live_cargo_ops_disabled');
            }

            try {
                $response = $this->trendyol->updateBoxInfo($account, $shipmentPackageId, $boxPayload);
                $operation->update(['status' => 'success', 'response_payload' => $response]);
                $order->update([
                    'operation_flags' => array_merge($order->operation_flags ?? [], ['trendyol_box_info' => $boxPayload]),
                    'last_synced_at' => now(),
                ]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function changeCargoProvider(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);
        $cargoProviderId = (string) ($payload['cargoProviderId'] ?? $payload['cargo_provider_id'] ?? '');
        $cargoProviderName = $payload['cargoProviderName'] ?? $payload['cargo_provider_name'] ?? null;

        if (! $shipmentPackageId || $cargoProviderId === '') {
            throw new MarketplaceApiException('shipmentPackageId ve cargoProviderId zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId, $cargoProviderId, $cargoProviderName) {
            $operation = $this->createOperation($account, $order, null, 'cargo_provider_change', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'cargoProviderId' => $cargoProviderId,
                'cargoProviderName' => $cargoProviderName,
            ]);

            if (! $this->liveCargoWritesEnabled()) {
                return $this->markBlocked($operation, 'TRENDYOL_LIVE_CARGO_OPS_CONFIRMED=false oldugu icin canli kargo firmasi degisikligi gonderilmedi.', 'live_cargo_ops_disabled');
            }

            try {
                $response = $this->trendyol->changeCargoProvider($account, $shipmentPackageId, $cargoProviderId);
                $operation->update(['status' => 'success', 'response_payload' => $response]);
                $order->update([
                    'cargo_provider_id' => $cargoProviderId,
                    'cargo_provider_name' => $cargoProviderName ?: $order->cargo_provider_name,
                    'last_synced_at' => now(),
                ]);

                return $operation->fresh();
            } catch (MarketplaceApiException $exception) {
                return $this->markFailed($operation, $exception);
            }
        });
    }

    public function deliveredByService(MarketplaceAccount $account, Order $order, array $payload): MarketplaceOrderOperation
    {
        $this->assertAccountOrder($account, $order);
        $shipmentPackageId = $this->shipmentPackageId($order, $payload);

        if (! $shipmentPackageId) {
            throw new MarketplaceApiException('shipmentPackageId zorunludur.', 422);
        }

        return DB::transaction(function () use ($account, $order, $shipmentPackageId, $payload) {
            $operation = $this->createOperation($account, $order, null, 'cargo_delivered_by_service', $shipmentPackageId, [
                'shipmentPackageId' => $shipmentPackageId,
                'serviceDelivery' => array_filter([
                    'serviceProvider' => $payload['serviceProvider'] ?? $payload['service_provider'] ?? null,
                    'deliveryDate' => $payload['deliveryDate'] ?? $payload['delivery_date'] ?? null,
                    'note' => $payload['note'] ?? null,
                ], fn ($value) => $value !== null && $value !== ''),
            ]);

            return $this->markBlocked($operation, 'Yetkili servis teslimat bildirimi bu sprintte sadece dry-run olarak loglanir; canli provider cagrisi kapali.', 'cargo_delivered_by_service_deferred');
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
            'request_payload' => $this->maskInvoicePayload($payload),
            'status' => 'pending',
        ]);
    }

    private function markBlocked(MarketplaceOrderOperation $operation, string $message, string $errorCode = 'live_order_ops_disabled'): MarketplaceOrderOperation
    {
        $operation->update([
            'status' => 'blocked',
            'error_code' => $errorCode,
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
            'response_payload' => is_array($exception->details) ? $this->maskInvoicePayload($exception->details) : $exception->details,
        ]);

        return $operation->fresh();
    }

    private function liveWritesEnabled(): bool
    {
        return filter_var(env('TRENDYOL_LIVE_ORDER_OPS_CONFIRMED', false), FILTER_VALIDATE_BOOLEAN);
    }

    private function liveInvoiceWritesEnabled(): bool
    {
        return filter_var(config('marketplaces.trendyol.live_invoice_ops_confirmed', env('TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED', false)), FILTER_VALIDATE_BOOLEAN);
    }

    private function liveCargoWritesEnabled(): bool
    {
        return filter_var(config('marketplaces.trendyol.live_cargo_ops_confirmed', env('TRENDYOL_LIVE_CARGO_OPS_CONFIRMED', false)), FILTER_VALIDATE_BOOLEAN);
    }

    private function shipmentPackageId(Order $order, array $payload): string
    {
        return (string) ($payload['shipmentPackageId'] ?? $payload['shipment_package_id'] ?? $order->provider_shipment_package_id);
    }

    private function boxInfoPayload(array $payload): array
    {
        return array_filter([
            'desi' => isset($payload['desi']) ? (float) $payload['desi'] : null,
            'boxQuantity' => isset($payload['boxQuantity']) || isset($payload['box_quantity'])
                ? (int) ($payload['boxQuantity'] ?? $payload['box_quantity'])
                : null,
            'weight' => isset($payload['weight']) ? (float) $payload['weight'] : null,
        ], fn ($value) => $value !== null && $value > 0);
    }

    private function maskInvoicePayload(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = $this->maskInvoicePayload($value);
                continue;
            }

            $normalized = strtolower((string) $key);
            if (str_contains($normalized, 'invoicelink') || str_contains($normalized, 'invoice_link') || str_contains($normalized, 'filecontent') || str_contains($normalized, 'file_content')) {
                $payload[$key] = '[masked]';
            }
        }

        return $payload;
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
