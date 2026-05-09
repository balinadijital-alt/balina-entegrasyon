<?php

namespace App\Services\Marketplaces;

use App\Models\MarketplaceAccount;
use App\Models\Order;
use Illuminate\Support\Facades\Http;

class TrendyolService extends AbstractMarketplaceService
{
    public function syncProducts(MarketplaceAccount $account): array
    {
        $products = $account->company->products()->with('images')->where('status', 'active')->get();
        $payload = [
            'items' => $products->map(fn ($product) => [
                'barcode' => $product->barcode,
                'title' => $product->name,
                'productMainId' => $product->sku,
                'brandName' => $product->brand,
                'quantity' => $product->stock,
                'salePrice' => $product->price,
                'vatRate' => $product->vat_rate,
            ])->values()->all(),
        ];

        $endpoint = "/suppliers/{$account->supplier_id}/v2/products";
        $this->loggedRequest($account, 'POST', $endpoint, $payload, fn () => Http::withBasicAuth($account->api_key, $account->api_secret)
            ->baseUrl(config('marketplaces.trendyol.base_url'))
            ->post($endpoint, $payload));

        return ['message' => 'Trendyol urun senkronizasyonu baslatildi.', 'count' => $products->count()];
    }

    public function syncOrders(MarketplaceAccount $account): array
    {
        $endpoint = "/suppliers/{$account->supplier_id}/orders";
        $response = $this->loggedRequest($account, 'GET', $endpoint, [], fn () => Http::withBasicAuth($account->api_key, $account->api_secret)
            ->baseUrl(config('marketplaces.trendyol.base_url'))
            ->get($endpoint));

        $orders = collect($response?->json('content', []));
        $orders->each(fn ($order) => Order::updateOrCreate(
            ['marketplace_code' => 'trendyol', 'marketplace_order_id' => (string) $order['id']],
            [
                'company_id' => $account->company_id,
                'customer_name' => trim(($order['customerFirstName'] ?? '').' '.($order['customerLastName'] ?? '')),
                'customer_email' => $order['customerEmail'] ?? null,
                'total_amount' => $order['totalPrice'] ?? 0,
                'status' => $order['status'] ?? 'new',
                'payload' => $order,
            ]
        ));

        return ['message' => 'Trendyol siparisleri senkronize edildi.', 'count' => $orders->count()];
    }
}
