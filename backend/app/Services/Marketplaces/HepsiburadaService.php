<?php

namespace App\Services\Marketplaces;

use App\Models\MarketplaceAccount;
use App\Models\Order;
use Illuminate\Support\Facades\Http;

class HepsiburadaService extends AbstractMarketplaceService
{
    public function syncProducts(MarketplaceAccount $account): array
    {
        $products = $account->company->products()->where('status', 'active')->get();
        $payload = [
            'merchantId' => $account->merchant_id,
            'items' => $products->map(fn ($product) => [
                'merchantSku' => $product->sku,
                'barcode' => $product->barcode,
                'productName' => $product->name,
                'brand' => $product->brand,
                'price' => $product->price,
                'availableStock' => $product->stock,
            ])->values()->all(),
        ];

        $endpoint = '/product/api/products/import';
        $this->loggedRequest($account, 'POST', $endpoint, $payload, fn () => Http::withHeaders([
            'Authorization' => 'Basic '.base64_encode("{$account->api_key}:{$account->api_secret}"),
        ])->baseUrl(config('marketplaces.hepsiburada.base_url'))->post($endpoint, $payload));

        return ['message' => 'Hepsiburada urun senkronizasyonu baslatildi.', 'count' => $products->count()];
    }

    public function syncOrders(MarketplaceAccount $account): array
    {
        $endpoint = "/packages/merchantid/{$account->merchant_id}";
        $response = $this->loggedRequest($account, 'GET', $endpoint, [], fn () => Http::withHeaders([
            'Authorization' => 'Basic '.base64_encode("{$account->api_key}:{$account->api_secret}"),
        ])->baseUrl(config('marketplaces.hepsiburada.base_url'))->get($endpoint));

        $orders = collect($response?->json('items', []));
        $orders->each(fn ($order) => Order::updateOrCreate(
            ['marketplace_code' => 'hepsiburada', 'marketplace_order_id' => (string) ($order['packageNumber'] ?? $order['id'])],
            [
                'company_id' => $account->company_id,
                'customer_name' => $order['recipientName'] ?? null,
                'customer_email' => $order['email'] ?? null,
                'total_amount' => $order['totalPrice'] ?? 0,
                'status' => $order['status'] ?? 'new',
                'payload' => $order,
            ]
        ));

        return ['message' => 'Hepsiburada siparisleri senkronize edildi.', 'count' => $orders->count()];
    }
}
