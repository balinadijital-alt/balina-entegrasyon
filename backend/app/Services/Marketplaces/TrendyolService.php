<?php

namespace App\Services\Marketplaces;

use App\Exceptions\MarketplaceApiException;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Product;
use App\Services\Products\ProductVariantPayloadResolver;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

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

    public function brands(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $response = $this->request($account, 'GET', '/integration/product/brands', array_filter([
            'page' => $query['page'] ?? 0,
            'size' => $query['size'] ?? 100,
            'name' => $query['name'] ?? null,
        ]));

        return [
            'brands' => $response->json('brands', $response->json('content', $response->json())),
            'fetched_at' => now()->toISOString(),
        ];
    }

    public function categoryAttributes(MarketplaceAccount $account, int|string $categoryId, bool $v2 = true): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = $v2
            ? "/integration/product/categories/{$categoryId}/attributes"
            : "/integration/product/product-categories/{$categoryId}/attributes";
        $response = $this->request($account, 'GET', $endpoint);

        return [
            'category_id' => $categoryId,
            'attributes' => $response->json('categoryAttributes', $response->json()),
            'raw' => $response->json(),
            'fetched_at' => now()->toISOString(),
        ];
    }

    public function categoryAttributeValues(MarketplaceAccount $account, int|string $categoryId, int|string $attributeId, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = "/integration/product/categories/{$categoryId}/attributes/{$attributeId}/values";
        $response = $this->request($account, 'GET', $endpoint, array_filter([
            'page' => $query['page'] ?? 0,
            'size' => $query['size'] ?? 100,
        ]));

        return [
            'category_id' => $categoryId,
            'attribute_id' => $attributeId,
            'values' => $response->json('content', $response->json()),
            'raw' => $response->json(),
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

        $products = $account->company->products()
            ->with(['images', 'parent.images'])
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

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

        $products = $account->company->products()
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

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

    public function batchResult(MarketplaceAccount $account, string $batchRequestId): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = "/integration/product/sellers/{$account->supplier_id}/products/batch-requests/{$batchRequestId}";
        $response = $this->request($account, 'GET', $endpoint);

        $account->update([
            'metadata' => array_merge($account->metadata ?? [], [
                'last_batch_result' => $response->json(),
                'last_batch_checked_at' => now()->toISOString(),
            ]),
            'last_error' => null,
        ]);

        return [
            'message' => 'Trendyol batch sonucu sorgulandi.',
            'batch_request_id' => $batchRequestId,
            'result' => $response->json(),
        ];
    }

    public function filterProducts(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $state = $query['state'] ?? 'approved';
        $endpoint = match ($state) {
            'approved' => "/integration/product/sellers/{$account->supplier_id}/products/approved",
            'unapproved' => "/integration/product/sellers/{$account->supplier_id}/products/unapproved",
            default => "/integration/product/sellers/{$account->supplier_id}/products",
        };
        $response = $this->request($account, 'GET', $endpoint, array_filter([
            'page' => $query['page'] ?? 0,
            'size' => $query['size'] ?? 50,
            'barcode' => $query['barcode'] ?? null,
            'stockCode' => $query['stockCode'] ?? null,
            'productMainId' => $query['productMainId'] ?? null,
            'status' => $query['status'] ?? null,
            'nextPageToken' => $query['nextPageToken'] ?? null,
        ]));

        return [
            'state' => $state,
            'products' => $response->json('content', $response->json()),
            'raw' => $response->json(),
        ];
    }

    public function archiveProducts(MarketplaceAccount $account, array $barcodes, bool $archive = true): array
    {
        $this->assertTrendyolAccount($account);

        $payload = [
            'items' => collect($barcodes)->filter()->take(1000)->map(fn ($barcode) => [
                'barcode' => (string) $barcode,
                'archived' => $archive,
            ])->values()->all(),
        ];
        $endpoint = "/integration/product/sellers/{$account->supplier_id}/products/archive-state";
        $response = $this->request($account, 'PUT', $endpoint, $payload);

        return [
            'message' => $archive ? 'Urunler arsive gonderildi.' : 'Urunler arsivden cikarildi.',
            'result' => $response->json(),
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

        $orders->each(fn (array $order) => $this->upsertOrder($account, $order));

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

    public function pullOrdersStream(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $end = isset($query['lastModifiedEndDate']) ? Carbon::parse($query['lastModifiedEndDate']) : now();
        $start = isset($query['lastModifiedStartDate']) ? Carbon::parse($query['lastModifiedStartDate']) : $end->copy()->subDays(14);
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/orders/stream";
        $response = $this->request($account, 'GET', $endpoint, array_filter([
            'size' => $query['size'] ?? 50,
            'nextCursor' => $query['nextCursor'] ?? null,
            'packageItemStatuses' => $query['packageItemStatuses'] ?? null,
            'lastModifiedStartDate' => $start->valueOf(),
            'lastModifiedEndDate' => $end->valueOf(),
        ]));

        $orders = collect($response->json('content', $response->json('shipmentPackages', [])));
        $orders->each(fn (array $order) => $this->upsertOrder($account, $order));
        $account->update(['last_order_sync_at' => now(), 'last_error' => null]);

        return [
            'message' => 'Trendyol stream siparisleri cekildi.',
            'count' => $orders->count(),
            'has_more' => (bool) $response->json('hasMore', false),
            'next_cursor' => $response->json('nextCursor'),
            'raw' => $response->json(),
        ];
    }

    public function returns(MarketplaceAccount $account, array $query = []): array
    {
        return $this->genericSellerGet($account, 'returns', '/integration/order/sellers/%s/claims', $query);
    }

    public function answerReturn(MarketplaceAccount $account, string $claimId, bool $approve, array $payload = []): array
    {
        $action = $approve ? 'approve' : 'reject';
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/claims/{$claimId}/items/{$action}";
        $response = $this->request($account, 'POST', $endpoint, $payload);

        return ['message' => $approve ? 'Iade onay istegi gonderildi.' : 'Iade red istegi gonderildi.', 'result' => $response->json()];
    }

    public function questions(MarketplaceAccount $account, array $query = []): array
    {
        return $this->genericSellerGet($account, 'questions', '/integration/qna/sellers/%s/questions/filter', $query);
    }

    public function answerQuestion(MarketplaceAccount $account, string $questionId, string $answer): array
    {
        $endpoint = "/integration/qna/sellers/{$account->supplier_id}/questions/{$questionId}/answers";
        $response = $this->request($account, 'POST', $endpoint, ['text' => $answer]);

        return ['message' => 'Musteri sorusu yanit kuyruguna gonderildi.', 'result' => $response->json()];
    }

    public function sendInvoiceLink(MarketplaceAccount $account, string $packageId, string $invoiceLink): array
    {
        $endpoint = "/integration/sellers/{$account->supplier_id}/shipment-packages/{$packageId}/invoice-link";
        $response = $this->request($account, 'POST', $endpoint, ['invoiceLink' => $invoiceLink]);

        return ['message' => 'Fatura linki Trendyol paketine gonderildi.', 'result' => $response->json()];
    }

    public function sendInvoiceFile(MarketplaceAccount $account, string $packageId, string $fileName, string $fileContentBase64): array
    {
        $endpoint = "/integration/sellers/{$account->supplier_id}/shipment-packages/{$packageId}/invoice-file";
        $response = $this->request($account, 'POST', $endpoint, ['fileName' => $fileName, 'fileContent' => $fileContentBase64]);

        return ['message' => 'Fatura dosyasi Trendyol paketine gonderildi.', 'result' => $response->json()];
    }

    public function commonLabelBarcode(MarketplaceAccount $account, array $query = []): array
    {
        return $this->genericSellerGet($account, 'common-label-barcode', '/integration/order/sellers/%s/common-label/barcodes', $query);
    }

    public function webhookPackages(MarketplaceAccount $account, array $payload): array
    {
        $orders = collect($payload['packages'] ?? $payload['content'] ?? [$payload])->filter(fn ($item) => is_array($item));
        $orders->each(fn (array $order) => $this->upsertOrder($account, $order));

        return [
            'message' => 'Trendyol webhook paketleri islendi.',
            'count' => $orders->count(),
        ];
    }

    private function request(MarketplaceAccount $account, string $method, string $endpoint, array $payload = []): Response
    {
        $this->throttle($account, $endpoint);

        $response = $this->loggedRequest($account, $method, $endpoint, $payload, function () use ($account, $method, $endpoint, $payload) {
            $pending = Http::withBasicAuth($account->api_key, $account->api_secret)
                ->baseUrl($this->baseUrl($account))
                ->timeout((int) config('marketplaces.trendyol.timeout', 20))
                ->retry(3, 750, throw: false)
                ->acceptJson()
                ->withHeaders([
                    'User-Agent' => $this->userAgent($account),
                    'Content-Type' => 'application/json',
                ] + $this->optionalHeaders($account));

            return match ($method) {
                'GET' => $pending->get($endpoint, $payload),
                'POST' => $pending->post($endpoint, $payload),
                'PUT' => $pending->put($endpoint, $payload),
                'DELETE' => $pending->delete($endpoint, $payload),
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

    private function baseUrl(MarketplaceAccount $account): string
    {
        $environment = data_get($account->metadata, 'environment', 'production');

        return $environment === 'stage'
            ? config('marketplaces.trendyol.stage_base_url')
            : config('marketplaces.trendyol.base_url');
    }

    private function userAgent(MarketplaceAccount $account): string
    {
        return data_get($account->metadata, 'user_agent')
            ?: "{$account->supplier_id} - BalinaEntegrasyon";
    }

    private function optionalHeaders(MarketplaceAccount $account): array
    {
        return array_filter([
            'storeFrontCode' => data_get($account->metadata, 'store_front_code'),
            'Accept-Language' => data_get($account->metadata, 'accept_language'),
        ]);
    }

    private function genericSellerGet(MarketplaceAccount $account, string $key, string $endpointPattern, array $query = []): array
    {
        $this->assertTrendyolAccount($account);
        $endpoint = sprintf($endpointPattern, $account->supplier_id);
        $response = $this->request($account, 'GET', $endpoint, $query);

        return [
            $key => $response->json('content', $response->json()),
            'raw' => $response->json(),
            'fetched_at' => now()->toISOString(),
        ];
    }

    private function productPayload(Product $product): array
    {
        $resolver = new ProductVariantPayloadResolver();
        $brandId = $resolver->value($product, 'trendyol_brand_id');
        $categoryId = $resolver->value($product, 'trendyol_category_id');

        if (! $product->barcode || ! $brandId || ! $categoryId) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin barkod, Trendyol marka ID ve kategori ID zorunludur.");
        }

        $images = $this->imagePayload($product, $resolver);

        if ($images === []) {
            throw new MarketplaceApiException("{$product->sku} SKU urunu icin en az bir HTTPS gorsel URL'i zorunludur.");
        }

        return [
            'barcode' => $product->barcode,
            'title' => $resolver->value($product, 'name'),
            'productMainId' => $resolver->variantGroupId($product),
            'brandId' => (int) $brandId,
            'categoryId' => (int) $categoryId,
            'quantity' => (int) $product->stock,
            'stockCode' => $product->sku,
            'dimensionalWeight' => (float) ($resolver->value($product, 'dimensional_weight') ?: 1),
            'description' => $resolver->value($product, 'description') ?: $resolver->value($product, 'name'),
            'listPrice' => (float) ($product->list_price ?: $product->price),
            'salePrice' => (float) $product->price,
            'vatRate' => (int) ($resolver->value($product, 'vat_rate') ?: 20),
            'images' => $images,
            'attributes' => $resolver->marketplaceAttributes($product, 'trendyol'),
        ];
    }

    private function imagePayload(Product $product, ?ProductVariantPayloadResolver $resolver = null): array
    {
        $resolver ??= new ProductVariantPayloadResolver();

        return collect($resolver->images($product))
            ->map(fn ($url) => ['url' => $url])
            ->filter()
            ->take(8)
            ->values()
            ->all();
    }

    private function upsertOrder(MarketplaceAccount $account, array $order): Order
    {
        return Order::updateOrCreate(
            ['marketplace_code' => 'trendyol', 'marketplace_order_id' => (string) ($order['id'] ?? $order['orderNumber'] ?? $order['packageNumber'] ?? Str::uuid())],
            [
                'company_id' => $account->company_id,
                'customer_name' => trim(($order['customerFirstName'] ?? '').' '.($order['customerLastName'] ?? '')) ?: ($order['customerName'] ?? null),
                'customer_email' => $order['customerEmail'] ?? null,
                'customer_phone' => $order['customerPhone'] ?? null,
                'shipping_address' => $order['shipmentAddress'] ?? $order['shippingAddress'] ?? null,
                'billing_address' => $order['invoiceAddress'] ?? $order['billingAddress'] ?? null,
                'total_amount' => $order['totalPrice'] ?? $order['grossAmount'] ?? 0,
                'status' => $this->normalizeOrderStatus($order['status'] ?? data_get($order, 'lines.0.status', 'new')),
                'payload' => $order,
            ]
        );
    }

    private function normalizeOrderStatus(string $status): string
    {
        return match (strtolower($status)) {
            'created', 'awaiting' => 'new',
            'picking', 'invoiced' => 'preparing',
            'shipped' => 'shipped',
            'delivered' => 'delivered',
            'cancelled' => 'cancelled',
            'returned' => 'returned',
            default => 'new',
        };
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
