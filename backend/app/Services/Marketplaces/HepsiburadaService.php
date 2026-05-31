<?php

namespace App\Services\Marketplaces;

use App\Exceptions\MarketplaceApiException;
use App\Models\CategoryMapping;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Product;
use App\Services\Products\ProductVariantPayloadResolver;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

class HepsiburadaService extends AbstractMarketplaceService
{
    public function testConnection(MarketplaceAccount $account): array
    {
        $this->assertAccount($account);

        $response = $this->request($account, 'GET', 'catalog', "/product/api/products/all-products-of-merchant/{$account->merchant_id}", [
            'page' => 0,
            'size' => 1,
        ]);

        $account->update([
            'connection_status' => 'connected',
            'connection_checked_at' => now(),
            'last_error' => null,
        ]);

        return [
            'message' => 'Hepsiburada baglantisi basarili.',
            'status' => 'connected',
            'environment' => $this->environment($account),
            'checked_at' => now()->toISOString(),
            'sample_count' => count($response->json('data', $response->json('items', []))),
        ];
    }

    public function categories(MarketplaceAccount $account): array
    {
        $this->assertAccount($account);

        $response = $this->request($account, 'GET', 'catalog', '/product/api/categories/get-all-categories', [
            'leaf' => true,
            'status' => 'ACTIVE',
            'available' => true,
            'version' => 1,
            'page' => 0,
            'size' => 1000,
        ]);

        return [
            'categories' => $response->json('data', $response->json('items', $response->json())),
            'environment' => $this->environment($account),
            'fetched_at' => now()->toISOString(),
        ];
    }

    public function syncProducts(MarketplaceAccount $account): array
    {
        return $this->sendProducts($account);
    }

    public function sendProducts(MarketplaceAccount $account): array
    {
        $this->assertAccount($account);
        $products = $account->company->products()
            ->with(['images', 'parent.images'])
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

        if ($products->isEmpty()) {
            throw new MarketplaceApiException('Hepsiburada icin aktif urun bulunamadi.');
        }

        $payload = $products->map(fn (Product $product) => $this->productPayload($account, $product))->values()->all();
        $file = tempnam(sys_get_temp_dir(), 'hb-products-').'.json';
        file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE));

        try {
            $response = $this->request($account, 'POST_FILE', 'catalog', '/product/api/products/import?version=1', [], [
                'field' => 'file',
                'path' => $file,
                'name' => 'products.json',
            ]);
        } finally {
            @unlink($file);
        }

        $trackingId = $response->json('data.trackingId') ?? $response->json('trackingId') ?? $response->json('id');

        $account->update([
            'last_product_sync_at' => now(),
            'last_error' => null,
            'metadata' => array_merge($account->metadata ?? [], ['last_hepsiburada_tracking_id' => $trackingId]),
        ]);

        return [
            'message' => 'Hepsiburada urun gonderimi tamamlandi.',
            'count' => $products->count(),
            'tracking_id' => $trackingId,
            'environment' => $this->environment($account),
        ];
    }

    public function updatePriceAndInventory(MarketplaceAccount $account): array
    {
        $this->assertAccount($account);
        $products = $account->company->products()
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

        if ($products->isEmpty()) {
            throw new MarketplaceApiException('Stok/fiyat guncellemesi icin aktif urun bulunamadi.');
        }

        $processed = 0;

        foreach ($products as $product) {
            $sku = $product->barcode ?? $product->sku;
            $merchantSku = strtoupper(str_replace(' ', '', $product->sku));
            $endpoint = "/listings/merchantid/{$account->merchant_id}/sku/{$sku}/merchantsku/{$merchantSku}";

            $this->request($account, 'POST', 'listing', $endpoint, [
                'newAvailableStock' => (int) $product->stock,
                'newPrice' => ['amount' => (float) $product->price, 'currency' => 'TRY'],
                'newDispatchTime' => 1,
            ]);
            $processed++;
        }

        $account->update([
            'last_price_sync_at' => now(),
            'last_error' => null,
        ]);

        return [
            'message' => 'Hepsiburada stok/fiyat guncellemesi tamamlandi.',
            'count' => $processed,
            'environment' => $this->environment($account),
        ];
    }

    public function syncOrders(MarketplaceAccount $account): array
    {
        return $this->pullOrders($account);
    }

    public function pullOrders(MarketplaceAccount $account): array
    {
        $this->assertAccount($account);

        $response = $this->request($account, 'GET', 'order', "/packages/merchantid/{$account->merchant_id}", [
            'limit' => 50,
            'offset' => 0,
        ]);

        $orders = collect($response->json('items', $response->json('data.items', $response->json('data', []))));

        $orders->each(fn (array $order) => Order::updateOrCreate(
            ['marketplace_code' => 'hepsiburada', 'marketplace_order_id' => (string) ($order['orderNumber'] ?? $order['packageNumber'] ?? $order['id'])],
            [
                'company_id' => $account->company_id,
                'customer_name' => $order['customerName'] ?? $order['recipientName'] ?? null,
                'customer_email' => $order['email'] ?? data_get($order, 'invoice.address.email'),
                'total_amount' => data_get($order, 'totalPrice.amount', data_get($order, 'unitPrice.amount', 0)),
                'status' => $order['status'] ?? 'Open',
                'payload' => $order,
            ]
        ));

        $account->update([
            'last_order_sync_at' => now(),
            'last_error' => null,
        ]);

        return [
            'message' => 'Hepsiburada siparisleri cekildi.',
            'count' => $orders->count(),
            'environment' => $this->environment($account),
        ];
    }

    private function request(MarketplaceAccount $account, string $method, string $base, string $endpoint, array $payload = [], ?array $file = null): Response
    {
        $this->throttle($account);

        $response = $this->loggedRequest($account, $method === 'POST_FILE' ? 'POST' : $method, $endpoint, $payload, function () use ($account, $method, $base, $endpoint, $payload, $file) {
            $pending = $this->pending($account, $base);

            return match ($method) {
                'GET' => $pending->get($endpoint, $payload),
                'POST' => $pending->post($endpoint, $payload),
                'POST_FILE' => $pending->attach($file['field'], fopen($file['path'], 'r'), $file['name'])->post($endpoint),
                default => throw new MarketplaceApiException("Desteklenmeyen Hepsiburada metodu: {$method}"),
            };
        });

        if (! $response->successful()) {
            $message = $response->json('message')
                ?? $response->json('error')
                ?? $response->json('errors.0.message')
                ?? 'Hepsiburada API istegi basarisiz oldu.';

            $account->update([
                'connection_status' => $response->status() === 401 ? 'failed' : $account->connection_status,
                'connection_checked_at' => $response->status() === 401 ? now() : $account->connection_checked_at,
                'last_error' => $message,
            ]);

            throw new MarketplaceApiException($message, $response->status(), $response->json());
        }

        return $response;
    }

    private function pending(MarketplaceAccount $account, string $base): PendingRequest
    {
        return Http::withBasicAuth($this->username($account), $this->password($account))
            ->baseUrl($this->resolveBaseUrl($account, $base))
            ->timeout((int) config('marketplaces.hepsiburada.timeout', 20))
            ->retry(3, 750, throw: false)
            ->acceptJson()
            ->withHeaders(['User-Agent' => 'Balina-Entegrasyon/1.0']);
    }

    private function environment(MarketplaceAccount $account): string
    {
        return data_get($account->metadata, 'environment') === 'stage' ? 'stage' : 'production';
    }

    private function resolveBaseUrl(MarketplaceAccount $account, string $base): string
    {
        $environment = $this->environment($account);

        $key = match ($base) {
            'listing' => $environment === 'stage' ? 'stage_listing_base_url' : 'listing_base_url',
            'order' => $environment === 'stage' ? 'stage_order_base_url' : 'order_base_url',
            default => $environment === 'stage' ? 'stage_base_url' : 'base_url',
        };

        $url = config("marketplaces.hepsiburada.{$key}");

        if ($environment === 'stage' && blank($url)) {
            throw new MarketplaceApiException('Hepsiburada test ortami URL ayarlari eksik. Canli ortama otomatik gecis engellendi.');
        }

        return (string) $url;
    }

    private function productPayload(MarketplaceAccount $account, Product $product): array
    {
        $resolver = new ProductVariantPayloadResolver();

        if (! $product->barcode) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin barkod zorunludur.");
        }

        $category = $resolver->value($product, 'category');
        $mapping = CategoryMapping::where('company_id', $account->company_id)
            ->where('marketplace_code', 'hepsiburada')
            ->where('local_category', $category)
            ->first();
        $fallbackCategoryId = $resolver->value($product, 'hepsiburada_category_id') ?: $resolver->value($product, 'trendyol_category_id');

        if (! $mapping && ! $fallbackCategoryId) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin Hepsiburada kategori eslestirmesi zorunludur.");
        }

        $images = $this->imageUrls($product, $resolver);
        $categoryId = $mapping?->external_category_id ?? (string) $fallbackCategoryId;
        $merchantSku = strtoupper(str_replace(' ', '', $product->sku));

        return [
            'categoryId' => is_numeric($categoryId) ? (int) $categoryId : $categoryId,
            'merchant' => $account->merchant_id,
            'attributes' => array_merge($mapping?->attributes ?? [], $resolver->marketplaceAttributes($product, 'hepsiburada')),
            'merchantSku' => $merchantSku,
            'VaryantGroupID' => $resolver->isVariantChild($product) ? $resolver->variantGroupId($product) : $merchantSku,
            'UrunAdi' => $resolver->value($product, 'name'),
            'UrunAciklamasi' => $resolver->value($product, 'description') ?: $resolver->value($product, 'name'),
            'Barcode' => $product->barcode,
            'Marka' => $resolver->value($product, 'brand'),
            'price' => number_format((float) $product->price, 2, ',', ''),
            'stock' => (string) $product->stock,
            'kdv' => (string) ($resolver->value($product, 'vat_rate') ?: 20),
            'desi' => (string) ($resolver->value($product, 'dimensional_weight') ?: 1),
            'Image1' => $images[0] ?? null,
            'Image2' => $images[1] ?? null,
            'Image3' => $images[2] ?? null,
            'Image4' => $images[3] ?? null,
            'Image5' => $images[4] ?? null,
        ];
    }

    private function imageUrls(Product $product, ?ProductVariantPayloadResolver $resolver = null): array
    {
        $resolver ??= new ProductVariantPayloadResolver();

        return collect($resolver->images($product))
            ->take(5)
            ->values()
            ->all();
    }

    private function assertAccount(MarketplaceAccount $account): void
    {
        if ($account->code !== 'hepsiburada') {
            throw new MarketplaceApiException('Bu islem sadece Hepsiburada hesaplari icin kullanilabilir.');
        }

        if (! $account->is_active) {
            throw new MarketplaceApiException('Hepsiburada hesabi pasif durumda.');
        }

        if (! $account->merchant_id || ! $this->username($account) || ! $this->password($account)) {
            throw new MarketplaceApiException('Hepsiburada merchant id, username ve password alanlari zorunludur.');
        }
    }

    private function username(MarketplaceAccount $account): ?string
    {
        return $account->service_username ?: $account->api_key;
    }

    private function password(MarketplaceAccount $account): ?string
    {
        return $account->service_password ?: $account->api_secret;
    }
}
