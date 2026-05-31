<?php

namespace App\Services\Marketplaces;

use App\Models\MarketplaceAccount;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Services\Products\ProductReadinessService;
use App\Services\Products\ProductVariantPayloadResolver;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class MarketplacePublishService
{
    public function __construct(private readonly ProductReadinessService $readiness)
    {
    }

    public function createDraft(MarketplaceAccount $marketplace, array $productIds, array $payload, ?int $userId = null): MarketplacePublishDraft
    {
        $products = Product::query()
            ->with(['company:id,name', 'images', 'parent.images', 'marketplaceStatuses'])
            ->where('company_id', $marketplace->company_id)
            ->whereIn('id', $productIds)
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

        $reports = $products
            ->mapWithKeys(fn (Product $product) => [
                $product->id => $this->readiness->check($product, $marketplace->code)['marketplaces'][$marketplace->code],
            ])
            ->all();

        $blocked = collect($reports)->contains(fn (array $report) => ! $report['ready']);

        return MarketplacePublishDraft::create([
            'company_id' => $marketplace->company_id,
            'marketplace_account_id' => $marketplace->id,
            'marketplace_code' => $marketplace->code,
            'status' => $blocked ? 'blocked' : 'ready',
            'product_ids' => $products->pluck('id')->values()->all(),
            'mappings' => $payload['mappings'] ?? [],
            'price_controls' => $payload['price_controls'] ?? [],
            'readiness_report' => $reports,
            'payload_preview' => $this->previewPayload($products, $marketplace->code, $payload),
            'created_by' => $userId,
        ]);
    }

    public function send(MarketplacePublishDraft $draft): MarketplacePublishDraft
    {
        if ($draft->status === 'blocked') {
            $draft->update(['error_message' => 'Hazir olmayan urunler provider gonderimine hazirlanamaz.']);

            return $draft->refresh();
        }

        DB::transaction(function () use ($draft) {
            $draft->update([
                'status' => 'queued',
                'sent_at' => now(),
                'result_summary' => [
                    'queued_product_count' => count($draft->product_ids ?? []),
                    'message' => 'Urunler provider gonderimine hazirlandi.',
                ],
            ]);

            Product::query()
                ->whereIn('id', $draft->product_ids ?? [])
                ->each(function (Product $product) use ($draft) {
                    $product->marketplaceStatuses()->updateOrCreate(
                        ['marketplace_code' => $draft->marketplace_code],
                        [
                            'status' => 'queued',
                            'readiness_status' => 'ready',
                            'last_payload' => $draft->payload_preview[$product->id] ?? null,
                            'last_response' => ['draft_id' => $draft->id, 'status' => 'queued'],
                            'error_message' => null,
                            'last_sent_at' => now(),
                        ]
                    );
                });
        });

        return $draft->refresh();
    }

    private function previewPayload(Collection $products, string $marketplace, array $payload): array
    {
        $resolver = new ProductVariantPayloadResolver();

        return $products->mapWithKeys(function (Product $product) use ($marketplace, $payload, $resolver) {
            return [
                $product->id => [
                    'marketplace' => $marketplace,
                    'variant_group_id' => $resolver->variantGroupId($product),
                    'sku' => $product->sku,
                    'barcode' => $product->barcode,
                    'name' => $resolver->value($product, 'name'),
                    'brand' => $resolver->value($product, 'brand'),
                    'category_id' => $marketplace === 'trendyol' ? $resolver->value($product, 'trendyol_category_id') : $resolver->value($product, 'hepsiburada_category_id'),
                    'price' => (float) $product->price,
                    'stock' => (int) $product->stock,
                    'vat_rate' => (int) ($resolver->value($product, 'vat_rate') ?: 20),
                    'attributes' => $resolver->marketplaceAttributes($product, $marketplace),
                    'mappings' => $payload['mappings'][$product->id] ?? [],
                ],
            ];
        })->all();
    }
}
