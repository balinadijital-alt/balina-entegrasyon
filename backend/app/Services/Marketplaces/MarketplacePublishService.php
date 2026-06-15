<?php

namespace App\Services\Marketplaces;

use App\Jobs\Trendyol\RunTrendyolProductPublishDraftJob;
use App\Models\MarketplaceAccount;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Services\Products\ProductReadinessService;
use App\Services\Products\ProductVariantPayloadResolver;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class MarketplacePublishService
{
    public function __construct(
        private readonly ProductReadinessService $readiness,
        private readonly TrendyolService $trendyol,
    )
    {
    }

    public function createDraft(MarketplaceAccount $marketplace, array $productIds, array $payload, ?int $userId = null): MarketplacePublishDraft
    {
        $this->ensureAccountCanPublish($marketplace);

        $products = Product::query()
            ->with(['company:id,name', 'images', 'parent.images', 'marketplaceStatuses'])
            ->where('company_id', $marketplace->company_id)
            ->whereIn('id', $productIds)
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

        $reports = $products
            ->mapWithKeys(fn (Product $product) => [
                $product->id => $this->readiness->check($product, $marketplace->code, $marketplace)['marketplaces'][$marketplace->code],
            ])
            ->all();

        $blocked = collect($reports)->contains(fn (array $report) => ! $report['ready']);

        return MarketplacePublishDraft::create([
            'company_id' => $marketplace->company_id,
            'marketplace_account_id' => $marketplace->id,
            'marketplace_code' => $marketplace->code,
            'operation_name' => $payload['operation_name'] ?? $payload['name'] ?? 'Toplu urun gonderimi',
            'operation_type' => $payload['operation_type'] ?? 'product_send',
            'schedule' => $payload['schedule'] ?? 'manual',
            'status' => $blocked ? 'blocked' : 'ready',
            'product_ids' => $products->pluck('id')->values()->all(),
            'mappings' => $payload['mappings'] ?? [],
            'price_controls' => $payload['price_controls'] ?? [],
            'operation_filters' => $payload['operation_filters'] ?? [],
            'readiness_report' => $reports,
            'payload_preview' => $this->previewPayload($products, $marketplace->code, $payload),
            'next_run_at' => $this->nextRunAt($payload['schedule'] ?? 'manual'),
            'created_by' => $userId,
        ]);
    }

    public function send(MarketplacePublishDraft $draft): MarketplacePublishDraft
    {
        $shouldDispatch = false;

        $locked = DB::transaction(function () use ($draft, &$shouldDispatch) {
            $locked = MarketplacePublishDraft::query()->lockForUpdate()->findOrFail($draft->id);

            if ($locked->status === 'blocked') {
                $locked->update(['error_message' => 'Hazir olmayan urunler provider gonderimine hazirlanamaz.']);

                return $locked;
            }

            if (! $this->isDispatchable($locked)) {
                return $locked;
            }

            $locked->update([
                'status' => 'queued',
                'sent_at' => now(),
                'result_summary' => [
                    'queued_product_count' => count($locked->product_ids ?? []),
                    'message' => 'Urunler Trendyol gonderim jobina alindi.',
                ],
            ]);

            Product::query()
                ->whereIn('id', $locked->product_ids ?? [])
                ->each(function (Product $product) use ($locked) {
                    $product->marketplaceStatuses()->updateOrCreate(
                        ['marketplace_code' => $locked->marketplace_code, 'marketplace_account_id' => $locked->marketplace_account_id],
                        [
                            'status' => 'queued',
                            'readiness_status' => 'ready',
                            'last_payload' => $locked->payload_preview[$product->id] ?? null,
                            'last_response' => ['draft_id' => $locked->id, 'status' => 'queued'],
                            'error_message' => null,
                            'last_sent_at' => now(),
                        ]
                    );
                });

            $shouldDispatch = $locked->marketplace_code === 'trendyol';

            return $locked;
        });

        if ($shouldDispatch) {
            RunTrendyolProductPublishDraftJob::dispatch($locked->fresh());
        }

        return $locked->refresh();
    }

    public function runDraft(MarketplacePublishDraft $draft): MarketplacePublishDraft
    {
        if ($draft->status === 'blocked' || filled($draft->batch_request_id) || ! in_array($draft->status, ['running'], true)) {
            return $draft;
        }

        $draft->loadMissing('marketplaceAccount');
        $marketplace = $draft->marketplaceAccount;

        $this->ensureAccountCanPublish($marketplace);

        $products = Product::query()
            ->with(['company:id,name', 'images', 'parent.images', 'marketplaceStatuses'])
            ->where('company_id', $draft->company_id)
            ->whereIn('id', $draft->product_ids ?? [])
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->get();

        $reports = $products
            ->mapWithKeys(fn (Product $product) => [
                $product->id => $this->readiness->check($product, $marketplace->code, $marketplace)['marketplaces'][$marketplace->code],
            ]);

        if ($reports->contains(fn (array $report) => ! $report['ready'])) {
            $draft->update([
                'status' => 'blocked',
                'readiness_report' => $reports->all(),
                'error_message' => 'Hazir olmayan urunler Trendyol gonderimine alinmadi.',
            ]);

            return $draft->refresh();
        }

        try {
            $result = $this->trendyol->sendProductCollection($marketplace, $products, $draft);
            $draft->update([
                'status' => 'submitted',
                'batch_request_id' => $result['batch_request_id'] ?? null,
                'result_summary' => $result,
                'next_run_at' => $this->nextRunAt($draft->schedule),
            ]);
        } catch (\Throwable $exception) {
            $draft->update([
                'status' => 'failed',
                'error_message' => $exception->getMessage(),
                'result_summary' => array_merge($draft->result_summary ?? [], [
                    'message' => $exception->getMessage(),
                    'failed_at' => now()->toISOString(),
                ]),
                'next_run_at' => $this->nextRunAt($draft->schedule),
            ]);

            Product::query()
                ->whereIn('id', $draft->product_ids ?? [])
                ->each(function (Product $product) use ($draft, $exception) {
                    $product->marketplaceStatuses()->updateOrCreate(
                        ['marketplace_code' => $draft->marketplace_code, 'marketplace_account_id' => $draft->marketplace_account_id],
                        [
                            'status' => 'failed',
                            'last_response' => ['draft_id' => $draft->id, 'message' => $exception->getMessage()],
                            'error_message' => $exception->getMessage(),
                            'last_checked_at' => now(),
                        ]
                    );
                });

            throw $exception;
        }

        return $draft->refresh();
    }

    public function refreshBatchResult(MarketplacePublishDraft $draft): MarketplacePublishDraft
    {
        $draft->loadMissing('marketplaceAccount');

        if ($draft->marketplace_code !== 'trendyol' || ! filled($draft->batch_request_id)) {
            throw ValidationException::withMessages([
                'batch_request_id' => 'Batch sonucu sorgulanacak Trendyol batch ID bulunmuyor.',
            ]);
        }

        $result = $this->trendyol->batchResult($draft->marketplaceAccount, $draft->batch_request_id, $draft);
        $summary = $result['summary'] ?? [];
        $failed = (int) ($summary['failed_count'] ?? 0);
        $rejected = (int) ($summary['rejected_count'] ?? 0);
        $success = (int) ($summary['success_count'] ?? 0);
        $processing = (int) ($summary['processing_count'] ?? 0);
        $unknown = (int) ($summary['unknown_count'] ?? 0);
        $status = ($failed + $rejected) > 0
            ? ($success > 0 ? 'partial_success' : 'rejected')
            : ($success > 0 ? 'completed' : (($processing + $unknown) > 0 ? 'processing' : $draft->status));

        $draft->update([
            'status' => $status,
            'result_summary' => array_merge($draft->result_summary ?? [], $result, ['checked_at' => now()->toISOString()]),
            'error_message' => ($failed + $rejected) > 0 ? (($summary['general_error'] ?? null) ?: 'Trendyol batch sonucunda hatali urunler var.') : null,
        ]);

        return $draft->refresh();
    }

    public function dispatchDueScheduledDrafts(): int
    {
        $ids = MarketplacePublishDraft::query()
            ->where('marketplace_code', 'trendyol')
            ->whereIn('status', ['ready', 'completed', 'failed'])
            ->whereIn('schedule', ['hourly', 'daily', 'weekly'])
            ->whereNotNull('next_run_at')
            ->where('next_run_at', '<=', now())
            ->pluck('id');

        $count = 0;

        foreach ($ids as $id) {
            $claimed = DB::transaction(function () use ($id) {
                $draft = MarketplacePublishDraft::query()->lockForUpdate()->find($id);

                if (! $draft
                    || ! in_array($draft->status, ['ready', 'completed', 'failed'], true)
                    || ! in_array($draft->schedule, ['hourly', 'daily', 'weekly'], true)
                    || ! $draft->next_run_at
                    || $draft->next_run_at->gt(now())
                ) {
                    return null;
                }

                $draft->update(['status' => 'scheduled', 'next_run_at' => null]);

                return $draft->refresh();
            });

            if ($claimed && $this->send($claimed)->status === 'queued') {
                $count++;
            }
        }

        return $count;
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
                    'operation' => $payload['operation_type'] ?? 'product_send',
                ],
            ];
        })->all();
    }

    private function ensureAccountCanPublish(MarketplaceAccount $marketplace): void
    {
        if (! $marketplace->is_active || $marketplace->connection_status !== 'connected' || ! $marketplace->connection_checked_at) {
            throw ValidationException::withMessages([
                'marketplace_account_id' => 'API dogrulanmadan urun gonderme islemi olusturulamaz. Once pazaryeri baglantisini test edin.',
            ]);
        }
    }

    private function isDispatchable(MarketplacePublishDraft $draft): bool
    {
        if (filled($draft->batch_request_id)) {
            return false;
        }

        return in_array($draft->status, ['draft', 'ready', 'scheduled', 'failed'], true);
    }

    private function nextRunAt(?string $schedule): ?Carbon
    {
        return match ($schedule) {
            'hourly' => now()->addHour(),
            'daily' => now()->addDay(),
            'weekly' => now()->addWeek(),
            default => null,
        };
    }
}
