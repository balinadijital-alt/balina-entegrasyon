<?php

namespace App\Services\Marketplaces;

use App\Exceptions\MarketplaceApiException;
use App\Models\MarketplaceAccount;
use App\Models\MarketplacePublishDraft;
use App\Models\MarketplaceReturnClaim;
use App\Models\MarketplaceReturnClaimItem;
use App\Models\MarketplaceReturnOperation;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\ProductMarketplaceStatus;
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
            'raw' => $response->json(),
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

        return $this->sendProductCollection($account, $products);
    }

    public function sendProductCollection(MarketplaceAccount $account, Collection $products, ?MarketplacePublishDraft $draft = null): array
    {
        $this->assertTrendyolAccount($account);

        if ($products->isEmpty()) {
            throw new MarketplaceApiException('Trendyol icin gonderilecek urun bulunamadi.');
        }

        $products->loadMissing(['images', 'parent.images', 'marketplaceStatuses']);
        $providerStates = $this->resolveProviderStates($account, $products);
        $payload = ['items' => $products->map(fn (Product $product) => $this->productPayload($product))->values()->all()];
        $endpoint = "/integration/product/sellers/{$account->supplier_id}/v2/products";
        $response = $this->request($account, 'POST', $endpoint, $payload);
        $batchRequestId = $response->json('batchRequestId');

        $products->each(function (Product $product) use ($account, $batchRequestId, $draft, $payload, $providerStates) {
            $product->update([
                'trendyol_batch_request_id' => $batchRequestId,
                'last_trendyol_sync_at' => now(),
            ]);

            $productPayload = collect($payload['items'])->first(fn (array $item) => (string) ($item['barcode'] ?? '') === (string) $product->barcode);

            $product->marketplaceStatuses()->updateOrCreate(
                ['marketplace_code' => 'trendyol', 'marketplace_account_id' => $account->id],
                [
                    'status' => 'submitted',
                    'readiness_status' => 'ready',
                    'provider_state' => $providerStates[$product->id] ?? 'new',
                    'batch_request_id' => $batchRequestId,
                    'last_payload' => $productPayload,
                    'last_response' => [
                        'draft_id' => $draft?->id,
                        'batch_request_id' => $batchRequestId,
                        'status' => 'submitted',
                    ],
                    'error_message' => null,
                    'last_sent_at' => now(),
                    'last_checked_at' => now(),
                ]
            );
        });

        $account->update([
            'last_product_sync_at' => now(),
            'last_error' => null,
            'metadata' => array_merge($account->metadata ?? [], ['last_product_batch_request_id' => $batchRequestId]),
        ]);

        return [
            'message' => 'Trendyol urun gonderimi kuyruga alindi.',
            'count' => $products->count(),
            'batch_request_id' => $batchRequestId,
            'provider_states' => array_count_values($providerStates),
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

    public function batchResult(MarketplaceAccount $account, string $batchRequestId, ?MarketplacePublishDraft $draft = null): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = "/integration/product/sellers/{$account->supplier_id}/products/batch-requests/{$batchRequestId}";
        $response = $this->request($account, 'GET', $endpoint);
        $summary = $this->applyBatchResult($account, $batchRequestId, $response->json(), $draft);

        $account->update([
            'metadata' => array_merge($account->metadata ?? [], [
                'last_batch_result' => $response->json(),
                'last_batch_summary' => $summary,
                'last_batch_checked_at' => now()->toISOString(),
            ]),
            'last_error' => null,
        ]);

        return [
            'message' => 'Trendyol batch sonucu sorgulandi.',
            'batch_request_id' => $batchRequestId,
            'summary' => $summary,
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

    public function resolveProductProviderStates(MarketplaceAccount $account, Collection $products): array
    {
        $products->each(fn (Product $product) => $product->loadMissing('marketplaceStatuses'));

        return $this->resolveProviderStates($account, $products);
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

    public function pullOrders(MarketplaceAccount $account, array $query = []): array
    {
        return $this->syncShipmentPackages($account, $query);
    }

    public function syncShipmentPackages(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $end = now();
        $start = $account->last_order_sync_at?->copy()->subMinutes(10) ?? now()->subDays(7);
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/orders";
        $statuses = collect($query['statuses'] ?? $query['status'] ?? [
            'Created',
            'Picking',
            'Invoiced',
            'Shipped',
            'Delivered',
            'Cancelled',
            'Returned',
            'UnDelivered',
            'Awaiting',
        ])->flatten()->filter()->values();
        $startDate = isset($query['startDate']) ? Carbon::parse($query['startDate']) : $start;
        $endDate = isset($query['endDate']) ? Carbon::parse($query['endDate']) : $end;
        $size = min((int) ($query['size'] ?? 50), 200);
        $synced = 0;
        $statusCounts = [];

        foreach ($statuses as $status) {
            $page = 0;

            do {
                $response = $this->request($account, 'GET', $endpoint, array_filter([
                    'status' => $status,
                    'startDate' => $startDate->valueOf(),
                    'endDate' => $endDate->valueOf(),
                    'orderByField' => 'PackageLastModifiedDate',
                    'orderByDirection' => 'DESC',
                    'page' => $page,
                    'size' => $size,
                ]));

                $orders = collect($response->json('content', $response->json('shipmentPackages', [])))
                    ->filter(fn ($item) => is_array($item))
                    ->values();

                $orders->each(fn (array $order) => $this->upsertLocalOrderFromShipmentPackage($account, $order));
                $synced += $orders->count();
                $statusCounts[$status] = ($statusCounts[$status] ?? 0) + $orders->count();
                $raw = $response->json();
                $totalPages = (int) ($raw['totalPages'] ?? $raw['totalPage'] ?? 0);
                $hasMore = (bool) ($raw['hasMore'] ?? $raw['has_more'] ?? false);
                $page++;
            } while ($orders->isNotEmpty() && $page < 50 && ($hasMore || ($totalPages > 0 && $page < $totalPages)));
        }

        $account->update([
            'last_order_sync_at' => Carbon::now(),
            'last_error' => null,
            'metadata' => array_merge($account->metadata ?? [], [
                'last_order_status_counts' => $statusCounts,
                'last_order_sync_range' => [
                    'startDate' => $startDate->toISOString(),
                    'endDate' => $endDate->toISOString(),
                ],
            ]),
        ]);

        return [
            'message' => 'Trendyol siparisleri cekildi.',
            'count' => $synced,
            'status_counts' => $statusCounts,
            'synced_at' => now()->toISOString(),
        ];
    }

    public function pullOrdersStream(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $end = isset($query['lastModifiedEndDate']) ? Carbon::parse($query['lastModifiedEndDate']) : now();
        $start = isset($query['lastModifiedStartDate']) ? Carbon::parse($query['lastModifiedStartDate']) : $end->copy()->subDays(14);
        $metadata = $account->metadata ?? [];
        $cursor = $query['nextCursor'] ?? data_get($metadata, 'trendyol_order_stream.next_cursor');
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/orders/stream";
        $response = $this->request($account, 'GET', $endpoint, array_filter([
            'size' => $query['size'] ?? 50,
            'nextCursor' => $cursor,
            'packageItemStatuses' => $query['packageItemStatuses'] ?? null,
            'lastModifiedStartDate' => $start->valueOf(),
            'lastModifiedEndDate' => $end->valueOf(),
        ]));

        $orders = collect($response->json('content', $response->json('shipmentPackages', [])));
        $orders->each(fn (array $order) => $this->upsertLocalOrderFromShipmentPackage($account, $order));
        $nextCursor = $response->json('nextCursor');
        $account->update([
            'last_order_sync_at' => now(),
            'last_error' => null,
            'metadata' => array_merge($metadata, [
                'trendyol_order_stream' => [
                    'next_cursor' => $nextCursor,
                    'has_more' => (bool) $response->json('hasMore', false),
                    'last_synced_at' => now()->toISOString(),
                ],
            ]),
        ]);

        return [
            'message' => 'Trendyol stream siparisleri cekildi.',
            'count' => $orders->count(),
            'has_more' => (bool) $response->json('hasMore', false),
            'next_cursor' => $response->json('nextCursor'),
            'raw' => $response->json(),
        ];
    }

    public function createTestOrder(MarketplaceAccount $account, array $payload): array
    {
        $this->assertTrendyolAccount($account);
        $endpoint = '/integration/test/order/orders/core';
        $payload = $this->testOrderPayload($payload);

        if (! $this->isStageAccount($account)) {
            return $this->logTestOrderOperation($account, 'POST', $endpoint, 'test_order_create', $payload, 'blocked', 'stage_environment_required', 'Test siparisi sadece Trendyol stage hesabi ile olusturulabilir.');
        }

        if (! $this->testOrderWritesEnabled()) {
            return $this->logTestOrderOperation($account, 'POST', $endpoint, 'test_order_create', $payload, 'blocked', 'live_test_order_not_confirmed', 'TRENDYOL_LIVE_TEST_ORDER_CONFIRMED=false oldugu icin test siparisi provider tarafina gonderilmedi.');
        }

        try {
            $response = $this->testOrderRequest($account, 'POST', $endpoint, $payload);

            return $this->logTestOrderOperation($account, 'POST', $endpoint, 'test_order_create', $payload, 'success', null, 'Trendyol stage test siparisi olusturuldu.', $response->json(), $response->status());
        } catch (MarketplaceApiException $exception) {
            return $this->logTestOrderOperation($account, 'POST', $endpoint, 'test_order_create', $payload, 'failed', 'provider_error', $exception->getMessage(), $exception->details, $exception->statusCode);
        }
    }

    public function updateTestOrderStatus(MarketplaceAccount $account, string $packageId, array $payload): array
    {
        $this->assertTrendyolAccount($account);
        $endpoint = "/integration/test/order/sellers/{$account->supplier_id}/shipment-packages/{$packageId}/status";
        $payload = $this->maskTestOrderPayload($payload);

        if (! $this->isStageAccount($account)) {
            return $this->logTestOrderOperation($account, 'PUT', $endpoint, 'test_order_status_update', $payload, 'blocked', 'stage_environment_required', 'Test siparis status guncellemesi sadece Trendyol stage hesabi ile kullanilabilir.');
        }

        if (! $this->testOrderWritesEnabled()) {
            return $this->logTestOrderOperation($account, 'PUT', $endpoint, 'test_order_status_update', $payload, 'blocked', 'live_test_order_not_confirmed', 'TRENDYOL_LIVE_TEST_ORDER_CONFIRMED=false oldugu icin test siparis status guncellemesi provider tarafina gonderilmedi.');
        }

        return $this->logTestOrderOperation($account, 'PUT', $endpoint, 'test_order_status_update', $payload, 'blocked', 'test_order_status_update_deferred', 'updateTestOrderStatus provider cagrisi ayri canli dogrulama sprintine ertelendi.');
    }

    public function returns(MarketplaceAccount $account, array $query = []): array
    {
        return $this->syncReturnClaims($account, $query);
    }

    public function answerReturn(MarketplaceAccount $account, string $claimId, bool $approve, array $payload = []): array
    {
        return $approve
            ? $this->approveClaimLineItems($account, $claimId, $payload['claimLineItemIds'] ?? $payload['claim_line_item_ids'] ?? [])
            : $this->createClaimIssue($account, $claimId, $payload);
    }

    public function syncReturnClaims(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);

        $endpoint = "/integration/order/sellers/{$account->supplier_id}/claims";
        $start = isset($query['startDate']) ? Carbon::parse($query['startDate']) : now()->subDays(30);
        $end = isset($query['endDate']) ? Carbon::parse($query['endDate']) : now();
        $page = (int) ($query['page'] ?? 0);
        $size = min((int) ($query['size'] ?? 50), 200);
        $synced = 0;

        do {
            $response = $this->request($account, 'GET', $endpoint, array_filter([
                'startDate' => $start->valueOf(),
                'endDate' => $end->valueOf(),
                'status' => $query['status'] ?? null,
                'page' => $page,
                'size' => $size,
            ]));
            $raw = $response->json();
            $claims = collect($raw['content'] ?? $raw['claims'] ?? $raw['items'] ?? [])
                ->filter(fn ($claim) => is_array($claim))
                ->values();
            $claims->each(fn (array $claim) => $this->upsertReturnClaim($account, $claim));
            $synced += $claims->count();
            $totalPages = (int) ($raw['totalPages'] ?? $raw['totalPage'] ?? 0);
            $hasMore = (bool) ($raw['hasMore'] ?? false);
            $page++;
        } while ($claims->isNotEmpty() && $page < 50 && ($hasMore || ($totalPages > 0 && $page < $totalPages)));

        $this->logReturnOperation($account, null, null, 'return_claim_sync', [
            'status' => $query['status'] ?? null,
            'startDate' => $start->toISOString(),
            'endDate' => $end->toISOString(),
        ], 'success', null, "Trendyol iade talepleri senkronize edildi: {$synced}", ['count' => $synced]);

        return [
            'message' => 'Trendyol iade talepleri cekildi.',
            'count' => $synced,
            'claims' => MarketplaceReturnClaim::with(['items', 'operations'])
                ->where('marketplace_account_id', $account->id)
                ->latest('updated_at')
                ->limit(50)
                ->get(),
        ];
    }

    public function localReturnClaims(MarketplaceAccount $account): array
    {
        $this->assertTrendyolAccount($account);

        return [
            'claims' => MarketplaceReturnClaim::with(['items', 'operations' => fn ($query) => $query->latest()->limit(20)])
                ->where('marketplace_account_id', $account->id)
                ->latest('updated_at')
                ->limit(50)
                ->get(),
        ];
    }

    public function getClaimIssueReasons(MarketplaceAccount $account, array $query = []): array
    {
        $this->assertTrendyolAccount($account);
        $endpoint = '/integration/order/claim-issue-reasons';
        $response = $this->request($account, 'GET', $endpoint, $query);
        $raw = $response->json();
        $reasons = collect($raw['reasons'] ?? $raw['content'] ?? $raw)
            ->filter(fn ($reason) => is_array($reason))
            ->map(fn (array $reason) => [
                'id' => (string) ($reason['id'] ?? $reason['reasonId'] ?? $reason['code'] ?? ''),
                'name' => (string) ($reason['name'] ?? $reason['reasonName'] ?? $reason['description'] ?? ''),
                'raw' => $this->maskProviderPayload($reason),
            ])
            ->filter(fn (array $reason) => $reason['id'] !== '')
            ->values()
            ->all();

        $this->logReturnOperation($account, null, null, 'return_reason_sync', $query, 'success', null, 'Trendyol iade red sebepleri cekildi.', ['count' => count($reasons)]);

        return ['message' => 'Iade red sebepleri cekildi.', 'reasons' => $reasons];
    }

    public function createClaimIssue(MarketplaceAccount $account, string $claimId, array $payload): array
    {
        $this->assertTrendyolAccount($account);
        $lineItemId = (string) ($payload['claimLineItemId'] ?? $payload['claim_line_item_id'] ?? '');
        $reasonId = (string) ($payload['reasonId'] ?? $payload['reason_id'] ?? '');
        $claim = $this->findReturnClaim($account, $claimId);
        $item = $lineItemId ? $this->findReturnClaimItem($account, $lineItemId) : null;
        $request = [
            'claimLineItemId' => $lineItemId,
            'reasonId' => $reasonId,
            'description' => $payload['description'] ?? null,
        ];

        if ($lineItemId === '' || $reasonId === '') {
            throw new MarketplaceApiException('claimLineItemId ve reasonId zorunludur.', 422);
        }

        if (! $this->returnWritesEnabled()) {
            return $this->logReturnOperation($account, $claim, $item, 'return_claim_issue_create', $request, 'blocked', 'live_return_ops_disabled', 'TRENDYOL_LIVE_RETURN_OPS_CONFIRMED=false oldugu icin iade red talebi provider tarafina gonderilmedi.');
        }

        $endpoint = "/integration/order/sellers/{$account->supplier_id}/claims/{$claimId}/items/issue";

        try {
            $response = $this->request($account, 'POST', $endpoint, $request);

            return $this->logReturnOperation($account, $claim, $item, 'return_claim_issue_create', $request, 'success', null, 'Iade red talebi Trendyol tarafina gonderildi.', $response->json());
        } catch (MarketplaceApiException $exception) {
            return $this->logReturnOperation($account, $claim, $item, 'return_claim_issue_create', $request, 'failed', 'provider_error', $exception->getMessage(), $exception->details);
        }
    }

    public function approveClaimLineItems(MarketplaceAccount $account, string $claimId, array $lineItemIds): array
    {
        $this->assertTrendyolAccount($account);
        $lineItemIds = collect($lineItemIds)->filter()->map(fn ($id) => (string) $id)->values()->all();
        $claim = $this->findReturnClaim($account, $claimId);
        $request = ['claimLineItemIds' => $lineItemIds];

        if ($lineItemIds === []) {
            throw new MarketplaceApiException('claimLineItemIds zorunludur.', 422);
        }

        if (! $this->returnWritesEnabled()) {
            return $this->logReturnOperation($account, $claim, null, 'return_claim_approve', $request, 'blocked', 'live_return_ops_disabled', 'TRENDYOL_LIVE_RETURN_OPS_CONFIRMED=false oldugu icin iade onayi provider tarafina gonderilmedi.');
        }

        $endpoint = "/integration/order/sellers/{$account->supplier_id}/claims/{$claimId}/items/approve";

        try {
            $response = $this->request($account, 'POST', $endpoint, $request);
            MarketplaceReturnClaimItem::where('marketplace_account_id', $account->id)
                ->whereIn('provider_claim_line_item_id', $lineItemIds)
                ->update(['status' => 'approved']);

            return $this->logReturnOperation($account, $claim, null, 'return_claim_approve', $request, 'success', null, 'Iade onayi Trendyol tarafina gonderildi.', $response->json());
        } catch (MarketplaceApiException $exception) {
            return $this->logReturnOperation($account, $claim, null, 'return_claim_approve', $request, 'failed', 'provider_error', $exception->getMessage(), $exception->details);
        }
    }

    public function getClaimItemAudits(MarketplaceAccount $account, string $claimId, array $query = []): array
    {
        $this->assertTrendyolAccount($account);
        $claim = $this->findReturnClaim($account, $claimId);
        $claimLineItemId = $query['claimLineItemId'] ?? $query['claim_line_item_id'] ?? null;
        $item = $claimLineItemId ? $this->findReturnClaimItem($account, (string) $claimLineItemId) : null;
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/claims/{$claimId}/items/audits";
        $response = $this->request($account, 'GET', $endpoint, array_filter(['claimLineItemId' => $claimLineItemId]));
        $raw = $response->json();
        $audits = collect($raw['audits'] ?? $raw['content'] ?? $raw)
            ->filter(fn ($audit) => is_array($audit))
            ->map(fn (array $audit) => $this->maskProviderPayload($audit))
            ->values()
            ->all();

        $this->logReturnOperation($account, $claim, $item, 'return_claim_audit_sync', ['claimLineItemId' => $claimLineItemId], 'success', null, 'Iade audit gecmisi cekildi.', ['audits' => $audits]);

        return ['message' => 'Iade audit gecmisi cekildi.', 'audits' => $audits];
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
        $orders->each(fn (array $order) => $this->upsertLocalOrderFromShipmentPackage($account, $order));

        return [
            'message' => 'Trendyol webhook paketleri islendi.',
            'count' => $orders->count(),
        ];
    }

    public function updatePackageStatus(MarketplaceAccount $account, string $shipmentPackageId, string $status, array $lines = []): array
    {
        $this->assertTrendyolAccount($account);

        $payload = [
            'status' => $status,
            'lines' => collect($lines)->map(fn ($line) => array_filter([
                'lineId' => (string) ($line['lineId'] ?? $line['provider_line_id'] ?? ''),
                'quantity' => (int) ($line['quantity'] ?? 1),
            ]))->values()->all(),
        ];
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/shipment-packages/{$shipmentPackageId}";
        $response = $this->request($account, 'PUT', $endpoint, $payload);

        return [
            'message' => 'Trendyol paket durumu guncellendi.',
            'status' => 'success',
            'provider_status' => $status,
            'result' => $response->json(),
        ];
    }

    public function cancelOrderPackageItem(MarketplaceAccount $account, string $shipmentPackageId, string $lineId, int $quantity, string $reasonId, ?string $description = null): array
    {
        $this->assertTrendyolAccount($account);

        $payload = [
            'lines' => [[
                'lineId' => $lineId,
                'quantity' => $quantity,
            ]],
            'reasonId' => $reasonId,
            'description' => $description,
        ];
        $endpoint = "/integration/order/sellers/{$account->supplier_id}/shipment-packages/{$shipmentPackageId}/items/unsupplied";
        $response = $this->request($account, 'PUT', $endpoint, array_filter($payload, fn ($value) => $value !== null));

        return [
            'message' => 'Trendyol tedarik edememe bildirimi gonderildi.',
            'status' => 'success',
            'provider_status' => 'cancelled',
            'result' => $response->json(),
        ];
    }

    private function testOrderPayload(array $payload): array
    {
        return array_replace_recursive([
            'customer' => [
                'firstName' => 'Test',
                'lastName' => 'Customer',
                'email' => 'test@example.invalid',
                'phone' => '5550000000',
            ],
            'invoiceAddress' => [
                'fullName' => 'Test Customer',
                'address' => 'Test Address',
                'city' => 'Test City',
                'district' => 'Test District',
            ],
            'shippingAddress' => [
                'fullName' => 'Test Customer',
                'address' => 'Test Address',
                'city' => 'Test City',
                'district' => 'Test District',
            ],
            'seller' => [
                'sellerId' => 'masked-seller',
            ],
        ], $payload);
    }

    private function logTestOrderOperation(MarketplaceAccount $account, string $method, string $endpoint, string $operationType, array $payload, string $status, ?string $errorCode, string $message, mixed $providerResponse = null, ?int $statusCode = null): array
    {
        $response = array_filter([
            'status' => $status,
            'operation_type' => $operationType,
            'error_code' => $errorCode,
            'message' => $message,
            'provider_response' => is_array($providerResponse) ? $this->maskTestOrderPayload($providerResponse) : null,
        ], fn ($value) => $value !== null);

        $this->log($account, $method, $endpoint, [
            'operation_type' => $operationType,
            'dry_run' => $status === 'blocked',
            'payload' => $this->maskTestOrderPayload($payload),
        ], $statusCode, $response, microtime(true), $status === 'failed' || $status === 'blocked' ? $message : null);

        return [
            'message' => $message,
            'status' => $status,
            'operation_type' => $operationType,
            'error_code' => $errorCode,
            'provider_called' => $status === 'success' || $status === 'failed',
            'result' => $response,
        ];
    }

    private function testOrderRequest(MarketplaceAccount $account, string $method, string $endpoint, array $payload): Response
    {
        $this->throttle($account, $endpoint);

        $response = Http::withBasicAuth($account->api_key, $account->api_secret)
            ->baseUrl((string) config('marketplaces.trendyol.stage_base_url'))
            ->timeout((int) config('marketplaces.trendyol.timeout', 20))
            ->retry(3, 750, throw: false)
            ->acceptJson()
            ->withHeaders([
                'User-Agent' => $this->userAgent($account),
                'Content-Type' => 'application/json',
                'sellerID' => (string) $account->supplier_id,
            ])
            ->send($method, $endpoint, ['json' => $payload]);

        if (! $response->successful()) {
            $message = $response->json('message')
                ?? $response->json('error')
                ?? $response->json('errors.0.message')
                ?? 'Trendyol test siparisi istegi basarisiz oldu.';

            throw new MarketplaceApiException($message, $response->status(), $response->json());
        }

        return $response;
    }

    private function maskTestOrderPayload(array $payload): array
    {
        $sensitiveKeys = ['api_key', 'apiSecret', 'api_secret', 'authorization', 'token'];
        $piiKeys = ['firstName', 'lastName', 'fullName', 'email', 'phone', 'address'];

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = $this->maskTestOrderPayload($value);
                continue;
            }

            if (in_array((string) $key, $sensitiveKeys, true)) {
                $payload[$key] = '[masked]';
                continue;
            }

            if (in_array((string) $key, $piiKeys, true) && ! $this->isSafeTestValue((string) $value)) {
                $payload[$key] = '[test-masked]';
            }
        }

        return $payload;
    }

    private function isSafeTestValue(string $value): bool
    {
        $value = Str::lower($value);

        return str_contains($value, 'test')
            || str_contains($value, 'example.invalid')
            || str_contains($value, 'masked');
    }

    private function isStageAccount(MarketplaceAccount $account): bool
    {
        return data_get($account->metadata, 'environment') === 'stage';
    }

    private function testOrderWritesEnabled(): bool
    {
        return filter_var(config('marketplaces.trendyol.live_test_order_confirmed', false), FILTER_VALIDATE_BOOLEAN);
    }

    private function upsertReturnClaim(MarketplaceAccount $account, array $claim): MarketplaceReturnClaim
    {
        $claimId = (string) ($claim['id'] ?? $claim['claimId'] ?? $claim['claimNumber'] ?? Str::uuid());
        $localClaim = MarketplaceReturnClaim::updateOrCreate(
            ['marketplace_account_id' => $account->id, 'provider_claim_id' => $claimId],
            [
                'marketplace_code' => 'trendyol',
                'provider_order_number' => $claim['orderNumber'] ?? $claim['orderId'] ?? null,
                'provider_shipment_package_id' => $claim['shipmentPackageId'] ?? $claim['packageNumber'] ?? null,
                'status' => $claim['status'] ?? $claim['claimStatus'] ?? null,
                'customer_masked' => $this->maskedCustomerName($claim),
                'claim_date' => $this->providerDate($claim['claimDate'] ?? $claim['createdDate'] ?? null),
                'last_synced_at' => now(),
                'provider_payload' => $this->maskProviderPayload($claim),
            ]
        );

        collect($claim['items'] ?? $claim['claimItems'] ?? $claim['claimLineItems'] ?? $claim['lines'] ?? [])
            ->filter(fn ($item) => is_array($item))
            ->each(fn (array $item, int $index) => $this->upsertReturnClaimItem($account, $localClaim, $item, $index));

        return $localClaim->fresh(['items']);
    }

    private function upsertReturnClaimItem(MarketplaceAccount $account, MarketplaceReturnClaim $claim, array $item, int $index): MarketplaceReturnClaimItem
    {
        $lineId = (string) ($item['claimLineItemId'] ?? $item['claimItemId'] ?? $item['lineItemId'] ?? $item['id'] ?? $index);

        return MarketplaceReturnClaimItem::updateOrCreate(
            ['marketplace_account_id' => $account->id, 'provider_claim_line_item_id' => $lineId],
            [
                'marketplace_return_claim_id' => $claim->id,
                'barcode' => $item['barcode'] ?? data_get($item, 'product.barcode'),
                'sku' => $item['merchantSku'] ?? $item['sku'] ?? $item['stockCode'] ?? data_get($item, 'product.stockCode'),
                'quantity' => max((int) ($item['quantity'] ?? 1), 1),
                'status' => $item['status'] ?? $item['claimItemStatus'] ?? $claim->status,
                'reason_id' => $item['reasonId'] ?? data_get($item, 'reason.id'),
                'reason_name' => $item['reasonName'] ?? data_get($item, 'reason.name'),
                'provider_payload' => $this->maskProviderPayload($item),
            ]
        );
    }

    private function logReturnOperation(MarketplaceAccount $account, ?MarketplaceReturnClaim $claim, ?MarketplaceReturnClaimItem $item, string $operationType, array $request, string $status, ?string $errorCode, string $message, mixed $response = null): array
    {
        $operation = MarketplaceReturnOperation::create([
            'marketplace_account_id' => $account->id,
            'marketplace_code' => 'trendyol',
            'marketplace_return_claim_id' => $claim?->id,
            'marketplace_return_claim_item_id' => $item?->id,
            'operation_type' => $operationType,
            'request_payload' => $this->maskProviderPayload($request),
            'response_payload' => is_array($response) ? $this->maskProviderPayload($response) : null,
            'status' => $status,
            'error_code' => $errorCode,
            'error_message' => $status === 'success' ? null : $message,
        ]);

        return [
            'message' => $message,
            'status' => $status,
            'operation_type' => $operationType,
            'error_code' => $errorCode,
            'provider_called' => $status === 'success' || $status === 'failed',
            'operation' => $operation->fresh(),
        ];
    }

    private function findReturnClaim(MarketplaceAccount $account, string $claimId): ?MarketplaceReturnClaim
    {
        return MarketplaceReturnClaim::where('marketplace_account_id', $account->id)
            ->where('provider_claim_id', $claimId)
            ->first();
    }

    private function findReturnClaimItem(MarketplaceAccount $account, string $lineItemId): ?MarketplaceReturnClaimItem
    {
        return MarketplaceReturnClaimItem::where('marketplace_account_id', $account->id)
            ->where('provider_claim_line_item_id', $lineItemId)
            ->first();
    }

    private function maskedCustomerName(array $payload): ?string
    {
        $name = trim((string) (($payload['customerFirstName'] ?? '').' '.($payload['customerLastName'] ?? '')));
        if ($name === '') {
            $name = (string) ($payload['customerName'] ?? data_get($payload, 'customer.fullName') ?? '');
        }

        return $name === '' ? null : '[masked-customer]';
    }

    private function providerDate(mixed $value): ?Carbon
    {
        if (! $value) {
            return null;
        }

        if (is_numeric($value)) {
            return Carbon::createFromTimestampMs((int) $value);
        }

        return Carbon::parse($value);
    }

    private function returnWritesEnabled(): bool
    {
        return filter_var(config('marketplaces.trendyol.live_return_ops_confirmed', false), FILTER_VALIDATE_BOOLEAN);
    }

    private function maskProviderPayload(array $payload): array
    {
        $sensitiveKeys = ['api_key', 'apiSecret', 'api_secret', 'authorization', 'token', 'supplierId'];
        $piiKeys = ['firstName', 'lastName', 'fullName', 'customerName', 'customerFirstName', 'customerLastName', 'email', 'phone', 'address', 'identityNumber', 'taxNumber', 'tckn'];

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                $payload[$key] = $this->maskProviderPayload($value);
                continue;
            }

            if (in_array((string) $key, $sensitiveKeys, true) || in_array((string) $key, $piiKeys, true)) {
                $payload[$key] = '[masked]';
            }
        }

        return $payload;
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
            $markConnectionFailed = $response->status() === 401
                && ! Str::contains($endpoint, '/claim-issue-reasons');

            $account->update([
                'connection_status' => $markConnectionFailed ? 'failed' : $account->connection_status,
                'connection_checked_at' => $markConnectionFailed ? now() : $account->connection_checked_at,
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

    private function resolveProviderStates(MarketplaceAccount $account, Collection $products): array
    {
        $states = [];
        $unresolved = collect();

        foreach ($products as $product) {
            $existing = $product->marketplaceStatuses
                ->first(fn (ProductMarketplaceStatus $status) => $status->marketplace_code === 'trendyol' && (int) $status->marketplace_account_id === (int) $account->id)
                ?: $product->marketplaceStatuses->first(fn (ProductMarketplaceStatus $status) => $status->marketplace_code === 'trendyol' && $status->marketplace_account_id === null);

            if (in_array($existing?->provider_state, ['approved', 'unapproved', 'rejected', 'not_found'], true) && $existing?->last_checked_at?->gte(now()->subHours(6))) {
                $states[$product->id] = $existing->provider_state;
                continue;
            }

            $unresolved->push($product);
        }

        if ($unresolved->isNotEmpty()) {
            $states += $this->resolveProviderStatesFromProvider($account, $unresolved);
        }

        return $states;
    }

    private function resolveProviderStatesFromProvider(MarketplaceAccount $account, Collection $products): array
    {
        $states = [];
        $productsByKey = [];

        foreach ($products as $product) {
            foreach ($this->providerLookupKeys($product) as $key) {
                $productsByKey[$key] ??= collect();
                $productsByKey[$key]->push($product);
            }
        }

        foreach (['approved', 'unapproved'] as $state) {
            if (count($states) >= $products->count()) {
                break;
            }

            try {
                foreach ($this->providerProductPages($account, $state) as $providerProduct) {
                    foreach ($this->providerItemLookupKeys($providerProduct) as $key) {
                        if (! isset($productsByKey[$key])) {
                            continue;
                        }

                        foreach ($productsByKey[$key] as $product) {
                            $states[$product->id] ??= $state;
                        }
                    }
                }
            } catch (MarketplaceApiException $exception) {
                foreach ($products as $product) {
                    $states[$product->id] ??= 'unknown';
                    $this->persistProviderState($product, $account, 'unknown', [
                        'provider_state_error' => $this->safeProviderMessage($exception->getMessage()),
                        'state' => $state,
                    ]);
                }

                return $states;
            }
        }

        foreach ($products as $product) {
            $states[$product->id] ??= 'not_found';
            $this->persistProviderState($product, $account, $states[$product->id]);
        }

        return $states;
    }

    private function providerProductPages(MarketplaceAccount $account, string $state): \Generator
    {
        $page = 0;
        $maxPages = 50;

        do {
            $result = $this->filterProducts($account, [
                'state' => $state,
                'page' => $page,
                'size' => 500,
            ]);

            $raw = $result['raw'] ?? [];
            $products = collect($result['products'] ?? [])->filter(fn ($item) => is_array($item))->values();

            foreach ($products as $product) {
                yield $product;
            }

            $page++;
            $totalPages = (int) ($raw['totalPages'] ?? $raw['totalPage'] ?? 0);
            $hasMore = (bool) ($raw['hasMore'] ?? $raw['has_more'] ?? false);
        } while (
            $products->isNotEmpty()
            && $page < $maxPages
            && ($hasMore || $totalPages === 0 || $page < $totalPages)
        );
    }

    private function providerLookupKeys(Product $product): array
    {
        return collect([$product->barcode, $product->sku])
            ->filter(fn ($value) => filled($value))
            ->map(fn ($value) => Str::lower(trim((string) $value)))
            ->unique()
            ->values()
            ->all();
    }

    private function providerItemLookupKeys(array $item): array
    {
        return collect([
            $item['barcode'] ?? null,
            $item['stockCode'] ?? null,
            $item['stock_code'] ?? null,
            $item['sku'] ?? null,
            data_get($item, 'requestItem.barcode'),
            data_get($item, 'requestItem.stockCode'),
        ])
            ->filter(fn ($value) => filled($value))
            ->map(fn ($value) => Str::lower(trim((string) $value)))
            ->unique()
            ->values()
            ->all();
    }

    private function persistProviderState(Product $product, MarketplaceAccount $account, string $state, array $response = []): void
    {
        $product->marketplaceStatuses()->updateOrCreate(
            ['marketplace_code' => 'trendyol', 'marketplace_account_id' => $account->id],
            [
                'provider_state' => $state,
                'last_response' => array_merge([
                    'provider_state' => $state,
                    'provider_state_checked_at' => now()->toISOString(),
                ], $response),
                'last_checked_at' => now(),
            ]
        );
    }

    private function applyBatchResult(MarketplaceAccount $account, string $batchRequestId, array $result, ?MarketplacePublishDraft $draft = null): array
    {
        $items = $this->batchItems($result);
        $batchState = $this->normalizeBatchStatus((string) ($this->batchItemValue($result, ['status', 'state', 'batchStatus', 'result.status']) ?? ''));
        $generalMessage = $this->batchItemMessage($result);
        $summary = [
            'item_count' => $items->count(),
            'success_count' => 0,
            'failed_count' => 0,
            'rejected_count' => 0,
            'processing_count' => 0,
            'unknown_count' => 0,
            'general_error' => null,
            'unmatched_items' => [],
            'items' => [],
        ];

        if ($items->isEmpty()) {
            if ($batchState === 'failed' || $batchState === 'rejected') {
                $summary['failed_count'] = 1;
                $summary['general_error'] = $generalMessage ?: 'Trendyol batch genel hata dondu.';
            } elseif ($batchState === 'success') {
                $summary['success_count'] = 1;
            } elseif ($batchState === 'processing') {
                $summary['processing_count'] = 1;
            } else {
                $summary['unknown_count'] = 1;
                $summary['general_error'] = $generalMessage ?: 'Batch sonucu henuz net degil, yeniden kontrol gerekli.';
            }

            return $summary;
        }

        $items->each(function (array $item) use ($account, $batchRequestId, $draft, &$summary) {
            $barcode = $this->batchItemValue($item, ['barcode', 'requestItem.barcode', 'requestItem.product.barcode', 'item.barcode']);
            $sku = $this->batchItemValue($item, ['stockCode', 'stock_code', 'sku', 'requestItem.stockCode', 'requestItem.product.stockCode', 'item.stockCode']);
            $state = $this->normalizeBatchStatus((string) $this->batchItemValue($item, ['status', 'state', 'result.status']));
            $errorCode = $this->batchItemErrorCode($item);
            $message = $this->safeProviderMessage($this->batchItemMessage($item));

            if ($state === 'success') {
                $summary['success_count']++;
            } elseif ($state === 'rejected') {
                $summary['rejected_count']++;
            } elseif ($state === 'processing') {
                $summary['processing_count']++;
            } elseif ($state === 'unknown') {
                $summary['unknown_count']++;
            } else {
                $summary['failed_count']++;
            }

            if (! $barcode && ! $sku) {
                $summary['unmatched_items'][] = [
                    'status' => $state,
                    'error_code' => $errorCode,
                    'message' => $message ?: 'SKU veya barkod bilgisi olmayan batch satiri.',
                    'item' => $item,
                ];
                return;
            }

            $product = Product::query()
                ->where('company_id', $account->company_id)
                ->where(function ($query) use ($barcode, $sku) {
                    $query->when($barcode, fn ($query) => $query->orWhere('barcode', $barcode))
                        ->when($sku, fn ($query) => $query->orWhere('sku', $sku));
                })
                ->first();

            $row = [
                'barcode' => $barcode,
                'sku' => $sku,
                'marketplace_account_id' => $account->id,
                'status' => $state,
                'error_code' => $errorCode,
                'message' => $message,
            ];

            if ($product) {
                $providerState = match ($state) {
                    'success' => 'approved',
                    'rejected' => 'rejected',
                    'failed' => 'unapproved',
                    'processing' => 'pending',
                    default => 'unknown',
                };

                $product->marketplaceStatuses()->updateOrCreate(
                    ['marketplace_code' => 'trendyol', 'marketplace_account_id' => $account->id],
                    [
                        'status' => $state,
                        'provider_state' => $providerState,
                        'batch_request_id' => $batchRequestId,
                        'last_response' => [
                            'draft_id' => $draft?->id,
                            'batch_request_id' => $batchRequestId,
                            'error_code' => $errorCode,
                            'error_message' => $message,
                            'item' => $item,
                        ],
                        'error_message' => $state === 'success' ? null : $message,
                        'last_checked_at' => now(),
                    ]
                );

                $row['product_id'] = $product->id;
                $row['provider_state'] = $providerState;
            } else {
                $summary['unmatched_items'][] = $row + ['message' => $message ?: 'Urun eslesmesi bulunamadi.'];
            }

            $summary['items'][] = $row;
        });

        return $summary;
    }

    private function batchItems(array $result): Collection
    {
        $items = data_get($result, 'items')
            ?? data_get($result, 'content')
            ?? data_get($result, 'batchRequestItems')
            ?? data_get($result, 'result.items')
            ?? data_get($result, 'result.content')
            ?? [];

        return collect($items)->filter(fn ($item) => is_array($item))->values();
    }

    private function batchItemValue(array $item, array $keys): ?string
    {
        foreach ($keys as $key) {
            $value = data_get($item, $key);

            if (filled($value)) {
                return (string) $value;
            }
        }

        return null;
    }

    private function batchItemMessage(array $item): ?string
    {
        $reasons = data_get($item, 'failureReasons')
            ?? data_get($item, 'errors')
            ?? data_get($item, 'messages')
            ?? null;

        if (is_array($reasons)) {
            return collect($reasons)
                ->map(fn ($reason) => is_array($reason) ? ($reason['message'] ?? json_encode($reason, JSON_UNESCAPED_UNICODE)) : $reason)
                ->filter()
                ->implode(', ');
        }

        return data_get($item, 'message') ?? data_get($item, 'errorMessage') ?? data_get($item, 'result.message');
    }

    private function batchItemErrorCode(array $item): ?string
    {
        $code = data_get($item, 'code')
            ?? data_get($item, 'errorCode')
            ?? data_get($item, 'result.code')
            ?? data_get($item, 'errors.0.code')
            ?? data_get($item, 'failureReasons.0.code');

        return filled($code) ? (string) $code : null;
    }

    private function safeProviderMessage(?string $message): ?string
    {
        if (! filled($message)) {
            return null;
        }

        return Str::limit(trim(preg_replace('/\s+/', ' ', (string) $message)), 500, '');
    }

    private function normalizeBatchStatus(string $status): string
    {
        $status = Str::lower($status);

        if (str_contains($status, 'success') || str_contains($status, 'complete') || str_contains($status, 'approve')) {
            return 'success';
        }

        if (str_contains($status, 'reject') || str_contains($status, 'unapprove')) {
            return 'rejected';
        }

        if (str_contains($status, 'process') || str_contains($status, 'progress') || str_contains($status, 'queue') || str_contains($status, 'wait')) {
            return 'processing';
        }

        if (str_contains($status, 'fail') || str_contains($status, 'error')) {
            return 'failed';
        }

        return 'unknown';
    }

    public function normalizeShipmentPackage(array $order): array
    {
        $packageId = (string) ($order['packageNumber'] ?? $order['shipmentPackageId'] ?? data_get($order, 'shipmentPackage.id') ?? $order['id'] ?? Str::uuid());
        $orderNumber = (string) ($order['orderNumber'] ?? $order['orderId'] ?? $order['id'] ?? $packageId);
        $providerStatus = (string) ($order['status'] ?? data_get($order, 'lines.0.status', 'Created'));
        $lines = collect($order['lines'] ?? $order['items'] ?? $order['orderLines'] ?? [])
            ->filter(fn ($line) => is_array($line))
            ->values();

        return [
            'marketplace_order_id' => $orderNumber,
            'provider_order_number' => $orderNumber,
            'provider_shipment_package_id' => $packageId,
            'provider_package_status' => $providerStatus,
            'provider_status' => $providerStatus,
            'status' => $this->normalizeOrderStatus($providerStatus),
            'customer_name' => trim(($order['customerFirstName'] ?? '').' '.($order['customerLastName'] ?? '')) ?: ($order['customerName'] ?? data_get($order, 'shipmentAddress.fullName')),
            'customer_email' => $order['customerEmail'] ?? data_get($order, 'invoiceAddress.email'),
            'customer_phone' => $order['customerPhone'] ?? data_get($order, 'shipmentAddress.phone') ?? data_get($order, 'invoiceAddress.phone'),
            'shipping_address' => $order['shipmentAddress'] ?? $order['shippingAddress'] ?? null,
            'billing_address' => $order['invoiceAddress'] ?? $order['billingAddress'] ?? null,
            'total_amount' => $order['totalPrice'] ?? $order['grossAmount'] ?? $order['totalAmount'] ?? 0,
            'cargo_provider_id' => data_get($order, 'cargoProviderId') ?? data_get($order, 'cargoProvider.id'),
            'cargo_provider_name' => data_get($order, 'cargoProviderName') ?? data_get($order, 'cargoProvider.name') ?? data_get($order, 'cargoProvider'),
            'cargo_tracking_number' => data_get($order, 'cargoTrackingNumber') ?? data_get($order, 'trackingNumber'),
            'lines' => $lines,
        ];
    }

    public function upsertLocalOrderFromShipmentPackage(MarketplaceAccount $account, array $order): Order
    {
        $normalized = $this->normalizeShipmentPackage($order);
        $localOrder = Order::updateOrCreate(
            [
                'marketplace_code' => 'trendyol',
                'marketplace_order_id' => $normalized['marketplace_order_id'],
            ],
            [
                'company_id' => $account->company_id,
                'marketplace_account_id' => $account->id,
                'provider_order_number' => $normalized['provider_order_number'],
                'provider_shipment_package_id' => $normalized['provider_shipment_package_id'],
                'provider_package_status' => $normalized['provider_package_status'],
                'provider_status' => $normalized['provider_status'],
                'cargo_provider_id' => $normalized['cargo_provider_id'],
                'cargo_provider_name' => $normalized['cargo_provider_name'],
                'cargo_tracking_number' => $normalized['cargo_tracking_number'],
                'customer_name' => $normalized['customer_name'],
                'customer_email' => $normalized['customer_email'],
                'customer_phone' => $normalized['customer_phone'],
                'shipping_address' => $normalized['shipping_address'],
                'billing_address' => $normalized['billing_address'],
                'total_amount' => $normalized['total_amount'],
                'status' => $normalized['status'],
                'shipping_status' => $this->normalizeShippingStatus($normalized['provider_package_status']),
                'payload' => $order,
                'provider_payload' => $order,
                'last_synced_at' => now(),
            ]
        );

        $normalized['lines']->each(fn (array $line, int $index) => $this->upsertOrderItem($account, $localOrder, $line, $index));

        return $localOrder->fresh(['items']);
    }

    private function upsertOrder(MarketplaceAccount $account, array $order): Order
    {
        return $this->upsertLocalOrderFromShipmentPackage($account, $order);
    }

    private function upsertOrderItem(MarketplaceAccount $account, Order $order, array $line, int $index): OrderItem
    {
        $lineId = (string) ($line['id'] ?? $line['lineId'] ?? $line['orderLineId'] ?? $line['shipmentPackageLineId'] ?? $index);
        $quantity = (int) ($line['quantity'] ?? $line['qty'] ?? 1);

        return $order->items()->updateOrCreate(
            ['provider_line_id' => $lineId],
            [
                'marketplace_account_id' => $account->id,
                'marketplace_code' => 'trendyol',
                'barcode' => $line['barcode'] ?? data_get($line, 'product.barcode'),
                'sku' => $line['merchantSku'] ?? $line['sku'] ?? $line['stockCode'] ?? data_get($line, 'product.stockCode'),
                'name' => $line['productName'] ?? $line['name'] ?? data_get($line, 'product.name'),
                'quantity' => max($quantity, 1),
                'unit_price' => $line['price'] ?? $line['amount'] ?? $line['discountedPrice'] ?? data_get($line, 'price.amount'),
                'provider_status' => $line['status'] ?? $order->provider_package_status,
                'provider_payload' => $line,
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
            'cancelled', 'canceled', 'unsupplied' => 'cancelled',
            'returned', 'undelivered' => 'returned',
            default => 'new',
        };
    }

    private function normalizeShippingStatus(?string $status): ?string
    {
        if (! filled($status)) {
            return null;
        }

        return match (strtolower((string) $status)) {
            'created', 'awaiting' => 'created',
            'picking', 'invoiced' => 'preparing',
            'shipped' => 'shipped',
            'delivered' => 'delivered',
            'cancelled', 'canceled', 'unsupplied' => 'cancelled',
            'returned', 'undelivered' => 'returned',
            default => Str::lower((string) $status),
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
