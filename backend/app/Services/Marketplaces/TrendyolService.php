<?php

namespace App\Services\Marketplaces;

use App\Exceptions\MarketplaceApiException;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

class TrendyolService extends AbstractMarketplaceService
{
    public function testConnection(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = "/integration/sellers/{$account->supplier_id}/addresses";
        $response = $this->request($account, 'GET', $endpoint);

        $account->update([
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
            'last_error' => null,
        ]);

        return [
            'message' => 'Trendyol baglantisi basarili.',
            'status' => 'connected',
            'checked_at' => now()->toISOString(),
            'addresses_count' => count($response->json() ?? []),
        ];
    }

    public function categories(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        $response = $this->request($account, 'GET', '/integration/product/product-categories');

        return [
            'categories' => $response->json('categories', $response->json()),
            'fetched_at' => now()->toISOString(),
        ];
    }

    public function syncProducts(MarketplaceAccount $account): array
    {
        return $this->sendProducts($account);
    }

    public function sendProducts(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        $products = $account->company->products()->with('images')->where('status', 'active')->get();

        if ($products->isEmpty()) {
            throw new MarketplaceApiException('Trendyol icin aktif urun bulunamadi.');
        }

        $payload = ['items' => $products->map(fn (Product $product) => $this->productPayload($product))->values()->all()];
        $endpoint = "/integration/product/sellers/{$account->supplier_id}/v2/products";
        $response = $this->request($account, 'POST', $endpoint, $payload);
        $batchRequestId = $response->json('batchRequestId');

        $products->each(fn (Product $product) => $product->update([
            'trendyol_batch_request_id' => $batchRequestId,
            'last_trendyol_sync_at' => now(),
        ]));

        $account->update([
            'last_product_sync_at' => now(),
            'last_error' => null,
            'metadata' => array_merge($account->metadata ?? [], ['last_product_batch_request_id' => $batchRequestId]),
        ]);

        return [
            'message' => 'Trendyol urun gonderimi kuyruga alindi.',
            'count' => $products->count(),
            'batch_request_id' => $batchRequestId,
        ];
    }

    public function updatePriceAndInventory(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        $products = $account->company->products()->where('status', 'active')->get();

        if ($products->isEmpty()) {
            throw new MarketplaceApiException('Stok/fiyat guncellemesi icin aktif urun bulunamadi.');
        }

        $payload = [
            'items' => $products->map(fn (Product $product) => [
                'barcode' => $product->barcode ?: $product->sku,
                'quantity' => (int) $product->stock,
                'salePrice' => (float) $product->price,
                'listPrice' => (float) ($product->list_price ?: $product->price),
            ])->values()->all(),
        ];

        $endpoint = "/integration/inventory/sellers/{$account->supplier_id}/products/price-and-inventory";
        $response = $this->request($account, 'POST', $endpoint, $payload);
        $batchRequestId = $response->json('batchRequestId');

        $account->update([
            'last_price_sync_at' => now(),
            'last_error' => null,
            'metadata' => array_merge($account->metadata ?? [], ['last_price_batch_request_id' => $batchRequestId]),
        ]);

        return [
            'message' => 'Trendyol stok/fiyat guncellemesi kuyruga alindi.',
            'count' => $products->count(),
            'batch_request_id' => $batchRequestId,
        ];
    }

    public function syncOrders(MarketplaceAccount $account): array
    {
        return $this->pullOrders($account);
    }

    public function pullOrders(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        $end = now();
        $start = $account->last_order_sync_at?->copy()->subMinutes(10) ?? now()->subDays(7);
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/orders";
        $query = [
            'status' => 'Created',
            'startDate' => $start->valueOf(),
            'endDate' => $end->valueOf(),
            'orderByField' => 'PackageLastModifiedDate',
            'orderByDirection' => 'DESC',
            'size' => 50,
        ];

        $response = $this->request($account, 'GET', $endpoint, $query);
        $orders = collect($response->json('content', []));

        $orders->each(fn (array $order) => Order::updateOrCreate(
            ['marketplace_code' => 'trendyol', 'marketplace_order_id' => (string) ($order['id'] ?? $order['orderNumber'])],
            [
                'company_id' => $account->company_id,
                'customer_name' => trim(($order['customerFirstName'] ?? '').' '.($order['customerLastName'] ?? '')) ?: null,
                'customer_email' => $order['customerEmail'] ?? null,
                'total_amount' => $order['totalPrice'] ?? $order['grossAmount'] ?? 0,
                'status' => $order['status'] ?? 'Created',
                'payload' => $order,
            ]
        ));

        $account->update([
            'last_order_sync_at' => Carbon::now(),
            'last_error' => null,
        ]);

        return [
            'message' => 'Trendyol siparisleri cekildi.',
            'count' => $orders->count(),
            'synced_at' => now()->toISOString(),
        ];
    }

    private function request(MarketplaceAccount $account, string $method, string $endpoint, array $payload = []): Response
    {
        $this->throttle($account);

        $response = $this->loggedRequest($account, $method, $endpoint, $payload, function () use ($account, $method, $endpoint, $payload) {
            $pending = Http::withBasicAuth($account->api_key, $account->api_secret)
                ->baseUrl(config('marketplaces.trendyol.base_url'))
                ->timeout((int) config('marketplaces.trendyol.timeout', 20))
                ->retry(3, 750, throw: false)
                ->acceptJson()
                ->withHeaders([
                    'User-Agent' => 'Balina-Entegrasyon/1.0',
                    'Content-Type' => 'application/json',
                ]);

            return match ($method) {
                'GET' => $pending->get($endpoint, $payload),
                'POST' => $pending->post($endpoint, $payload),
                'PUT' => $pending->put($endpoint, $payload),
                default => throw new MarketplaceApiException("Desteklenmeyen Trendyol metodu: {$method}"),
            };
        });

        if (! $response->successful()) {
            $message = $response->json('message')
                ?? $response->json('error')
                ?? $response->json('errors.0.message')
                ?? 'Trendyol API istegi basarisiz oldu.';

            $account->update([
                'connection_status' => $response->status() === 401 ? 'failed' : $account->connection_status,
                'connection_checked_at' => $response->status() === 401 ? now() : $account->connection_checked_at,
                'last_error' => $message,
            ]);

            throw new MarketplaceApiException($message, $response->status(), $response->json());
        }

        return $response;
    }

    private function productPayload(Product $product): array
    {
        if (! $product->barcode || ! $product->trendyol_brand_id || ! $product->trendyol_category_id) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin barkod, Trendyol marka ID ve kategori ID zorunludur.");
        }

        $images = $this->imagePayload($product);

        if ($images === []) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin en az bir HTTPS gorsel URL'i zorunludur.");
        }

        return [
            'barcode' => $product->barcode,
            'title' => $product->name,
            'productMainId' => $product->sku,
            'brandId' => (int) $product->trendyol_brand_id,
            'categoryId' => (int) $product->trendyol_category_id,
            'quantity' => (int) $product->stock,
            'stockCode' => $product->sku,
            'dimensionalWeight' => (float) ($product->dimensional_weight ?: 1),
            'description' => $product->description ?: $product->name,
            'listPrice' => (float) ($product->list_price ?: $product->price),
            'salePrice' => (float) $product->price,
            'vatRate' => (int) $product->vat_rate,
            'images' => $images,
            'attributes' => $product->trendyol_attributes ?: [],
        ];
    }

    private function imagePayload(Product $product): array
    {
        return $product->images
            ->map(function ($image) {
                $url = str_starts_with($image->path, 'http') ? $image->path : Storage::disk('public')->url($image->path);

                return str_starts_with($url, 'https://') ? ['url' => $url] : null;
            })
            ->filter()
            ->take(8)
            ->values()
            ->all();
    }

    private function assertTrendyolAccount(MarketplaceAccount $account): void
    {
        if ($account->code !== 'trendyol') {
            throw new MarketplaceApiException('Bu islem sadece Trendyol hesaplari icin kullanilabilir.');
        }

        if (! $account->is_active) {
            throw new MarketplaceApiException('Trendyol hesabi pasif durumda.');
        }

        if (! $account->supplier_id || ! $account->api_key || ! $account->api_secret) {
            throw new MarketplaceApiException('Trendyol supplier ID, API key ve API secret alanlari zorunludur.');
        }
    }
}
