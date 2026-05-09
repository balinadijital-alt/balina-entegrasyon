<?php

namespace App\Services\Shipping\Providers;

use App\Models\ApiLog;
use App\Models\Order;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Services\Shipping\Contracts\ShippingProvider;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

abstract class AbstractCargoService implements ShippingProvider
{
    abstract protected function code(): string;

    public function createShipment(Order $order, ShippingAccount $account, array $payload = []): array
    {
        $this->assertAccount($account);
        $request = $this->shipmentPayload($order, $account, $payload);
        $response = $this->send($account, 'create_shipment', $request);

        $barcode = data_get($response, 'barcode') ?: data_get($response, 'data.barcode') ?: $this->fallbackBarcode($order, $account);
        $tracking = data_get($response, 'tracking_number') ?: data_get($response, 'trackingNumber') ?: $barcode;

        return [
            'status' => 'created',
            'barcode' => (string) $barcode,
            'tracking_number' => (string) $tracking,
            'request_payload' => $request,
            'response_payload' => $response,
            'shipped_at' => now(),
        ];
    }

    public function track(Shipment $shipment): array
    {
        $account = $shipment->account()->with('carrier')->firstOrFail();
        $this->assertAccount($account);
        $response = $this->send($account, 'tracking', ['tracking_number' => $shipment->tracking_number, 'barcode' => $shipment->barcode]);
        $status = data_get($response, 'status') ?: data_get($response, 'data.status') ?: 'in_transit';

        return [
            'status' => $status,
            'response_payload' => $response,
            'delivered_at' => in_array($status, ['delivered', 'teslim_edildi'], true) ? now() : $shipment->delivered_at,
        ];
    }

    public function label(Shipment $shipment): array
    {
        $account = $shipment->account()->with('carrier')->firstOrFail();
        $this->assertAccount($account);
        $response = $this->send($account, 'label', ['barcode' => $shipment->barcode, 'tracking_number' => $shipment->tracking_number]);
        $labelUrl = data_get($response, 'label_url') ?: data_get($response, 'data.labelUrl');
        $labelContent = data_get($response, 'label_base64') ?: data_get($response, 'data.labelBase64');
        $path = $shipment->label_path;

        if ($labelContent) {
            $path = "shipping-labels/{$shipment->id}-".Str::uuid().'.pdf';
            Storage::disk('public')->put($path, base64_decode($labelContent));
        }

        if (! $labelUrl && ! $path) {
            $path = "shipping-labels/{$shipment->id}-".Str::uuid().'.html';
            Storage::disk('public')->put($path, $this->fallbackLabel($shipment));
        }

        return [
            'status' => $shipment->status === 'queued' ? 'created' : $shipment->status,
            'label_url' => $labelUrl,
            'label_path' => $path,
            'response_payload' => $response,
        ];
    }

    public function createReturnCode(Shipment $shipment): array
    {
        $account = $shipment->account()->with('carrier')->firstOrFail();
        $this->assertAccount($account);
        $response = $this->send($account, 'return_code', ['barcode' => $shipment->barcode, 'tracking_number' => $shipment->tracking_number]);

        return [
            'return_code' => data_get($response, 'return_code') ?: data_get($response, 'data.returnCode') ?: 'RET-'.$shipment->id.'-'.now()->format('His'),
            'response_payload' => $response,
        ];
    }

    protected function send(ShippingAccount $account, string $action, array $payload): array
    {
        $endpoint = data_get($account->settings, "endpoints.{$action}");
        $startedAt = microtime(true);

        if (! $account->base_url || ! $endpoint) {
            $response = ['mock' => true, 'action' => $action, 'barcode' => $payload['barcode'] ?? null, 'tracking_number' => $payload['tracking_number'] ?? null];
            $this->log($account, strtoupper($action), $endpoint ?: $action, $payload, 200, $response, $startedAt);

            return $response;
        }

        try {
            $pending = Http::baseUrl($account->base_url)
                ->timeout((int) data_get($account->settings, 'timeout', 30))
                ->retry(3, 750, throw: false)
                ->acceptJson()
                ->withHeaders(array_filter([
                    'X-Api-Key' => $account->api_key,
                    'X-Customer-Code' => $account->customer_code,
                    'User-Agent' => 'Balina-Entegrasyon/1.0',
                ]));

            if ($account->username && $account->password) {
                $pending = $pending->withBasicAuth($account->username, $account->password);
            }

            /** @var Response $http */
            $http = $pending->post($endpoint, $payload);
            $json = $http->json() ?? [];
            $this->log($account, 'POST', $endpoint, $payload, $http->status(), $json, $startedAt);

            if (! $http->successful()) {
                throw new RuntimeException(data_get($json, 'message') ?: 'Kargo API istegi basarisiz oldu.');
            }

            return $json;
        } catch (Throwable $exception) {
            $this->log($account, 'POST', $endpoint, $payload, null, null, $startedAt, $exception->getMessage());
            throw $exception;
        }
    }

    protected function shipmentPayload(Order $order, ShippingAccount $account, array $payload): array
    {
        return [
            'customer_code' => $account->customer_code,
            'order_id' => $order->id,
            'marketplace_order_id' => $order->marketplace_order_id,
            'customer_name' => $order->customer_name,
            'customer_email' => $order->customer_email,
            'order_total' => (float) $order->total_amount,
            'recipient' => data_get($order->payload, 'shipmentAddress', data_get($order->payload, 'shippingAddress', [])),
            'items' => data_get($order->payload, 'lines', data_get($order->payload, 'items', [])),
            'options' => $payload,
        ];
    }

    protected function assertAccount(ShippingAccount $account): void
    {
        if (! $account->is_active) {
            throw new RuntimeException('Kargo hesabi pasif durumda.');
        }
    }

    protected function fallbackBarcode(Order $order, ShippingAccount $account): string
    {
        return strtoupper($this->code()).'-'.$account->id.'-'.$order->id.'-'.now()->format('YmdHis');
    }

    protected function fallbackLabel(Shipment $shipment): string
    {
        $order = $shipment->order;

        return '<!doctype html><html><head><meta charset="utf-8"><title>Kargo Etiketi</title><style>body{font-family:Arial,sans-serif;padding:24px}.label{border:2px solid #111;padding:18px;max-width:420px}.barcode{font-size:22px;font-weight:700;letter-spacing:1px}</style></head><body><div class="label"><h1>Kargo Etiketi</h1><p><strong>Kargo:</strong> '.e($shipment->carrier_code).'</p><p><strong>Siparis:</strong> '.e($order?->marketplace_order_id).'</p><p><strong>Alici:</strong> '.e($order?->customer_name).'</p><p><strong>Takip:</strong> '.e($shipment->tracking_number).'</p><p class="barcode">'.e($shipment->barcode).'</p></div></body></html>';
    }

    protected function log(ShippingAccount $account, string $method, string $endpoint, array $request, ?int $status, mixed $response, float $startedAt, ?string $error = null): void
    {
        ApiLog::create([
            'company_id' => $account->company_id,
            'marketplace_code' => 'cargo:'.$account->carrier->code,
            'direction' => 'outbound',
            'method' => $method,
            'endpoint' => $endpoint,
            'status_code' => $status,
            'request_payload' => $request,
            'response_payload' => is_array($response) ? $response : null,
            'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            'error_message' => $error,
        ]);
    }
}
