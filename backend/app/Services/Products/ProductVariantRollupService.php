<?php

namespace App\Services\Products;

use App\Models\Product;
use Illuminate\Support\Collection;

class ProductVariantRollupService
{
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];
    private const PROBLEM_CHILDREN_LIMIT = 20;

    public function readiness(Product $product): ?array
    {
        if ($product->product_type !== 'parent') {
            return null;
        }

        $children = $this->children($product);
        $total = $children->count();
        $scores = [];
        $missing = [];
        $readyChildren = 0;

        foreach ($children as $child) {
            $reports = collect($child->marketplace_readiness ?? []);
            $childReady = $reports->isNotEmpty() && $reports->every(fn (array $report) => (bool) ($report['ready'] ?? false));

            if ($childReady) {
                $readyChildren++;
            }

            $reports->each(function (array $report) use (&$scores, &$missing) {
                $scores[] = (int) ($report['score'] ?? 0);
            });

            $reports
                ->flatMap(fn (array $report) => $report['missing_fields'] ?? [])
                ->unique()
                ->each(function (string $field) use (&$missing) {
                    $missing[$field] = ($missing[$field] ?? 0) + 1;
                });
        }

        arsort($missing);

        return [
            'total_children' => $total,
            'ready_children' => $readyChildren,
            'blocked_children' => max(0, $total - $readyChildren),
            'readiness_score' => $scores === [] ? 0 : (int) round(array_sum($scores) / count($scores)),
            'missing_fields_summary' => $missing,
            'marketplaces' => collect(self::MARKETPLACES)
                ->mapWithKeys(fn (string $marketplace) => [$marketplace => $this->marketplaceReadiness($children, $marketplace)])
                ->all(),
        ];
    }

    public function marketplaceStatuses(Product $product): ?array
    {
        if ($product->product_type !== 'parent') {
            return null;
        }

        $children = $this->children($product);

        return collect(self::MARKETPLACES)
            ->mapWithKeys(fn (string $marketplace) => [$marketplace => $this->marketplaceStatus($children, $marketplace)])
            ->all();
    }

    private function marketplaceReadiness(Collection $children, string $marketplace): array
    {
        $ready = 0;
        $scores = [];
        $missing = [];

        foreach ($children as $child) {
            $report = $child->marketplace_readiness[$marketplace] ?? null;
            if (! is_array($report)) {
                continue;
            }

            if (! empty($report['ready'])) {
                $ready++;
            }

            $scores[] = (int) ($report['score'] ?? 0);
            foreach ($report['missing_fields'] ?? [] as $field) {
                $missing[$field] = ($missing[$field] ?? 0) + 1;
            }
        }

        arsort($missing);
        $total = $children->count();

        return [
            'total_children' => $total,
            'ready_children' => $ready,
            'blocked_children' => max(0, $total - $ready),
            'readiness_score' => $scores === [] ? 0 : (int) round(array_sum($scores) / count($scores)),
            'missing_fields_summary' => $missing,
        ];
    }

    private function marketplaceStatus(Collection $children, string $marketplace): array
    {
        $statuses = $children
            ->map(function (Product $child) use ($marketplace) {
                $status = $child->marketplaceStatuses->firstWhere('marketplace_code', $marketplace);
                $status?->setRelation('product', $child);

                return $status;
            })
            ->filter()
            ->values();

        $failedStatuses = $statuses->filter(fn ($status) => in_array($status->status, ['failed', 'problematic', 'blocked'], true));
        $rejectedStatuses = $statuses->filter(fn ($status) => $status->status === 'rejected');
        $queuedStatuses = $statuses->filter(fn ($status) => in_array($status->status, ['queued', 'sent'], true));
        $approvedStatuses = $statuses->filter(fn ($status) => $status->status === 'approved');
        $knownStatuses = ['ready', 'not_ready', 'queued', 'sent', 'failed', 'approved', 'rejected', 'problematic', 'blocked'];
        $partialChildren = max(0, $children->count() - $failedStatuses->count() - $rejectedStatuses->count() - $queuedStatuses->count() - $approvedStatuses->count());
        $latestBatchStatus = $this->latestStatusWith($statuses, 'batch_request_id');
        $latestSentStatus = $this->latestStatusWith($statuses, 'last_sent_at');
        $latestCheckedStatus = $this->latestStatusWith($statuses, 'last_checked_at');
        $rollupStatus = $this->rollupStatus(
            $statuses->pluck('status')->filter()->map(fn ($status) => (string) $status)->values(),
            $statuses->pluck('readiness_status')->filter()->map(fn ($status) => (string) $status)->values(),
            $children->count()
        );

        return [
            'rollup_status' => $rollupStatus,
            'total_children' => $children->count(),
            'status_counts' => $statuses
                ->pluck('status')
                ->filter()
                ->countBy()
                ->all(),
            'readiness_counts' => $statuses
                ->pluck('readiness_status')
                ->filter()
                ->countBy()
                ->all(),
            'failed_children' => $statuses
                ->filter(fn ($status) => in_array($status->status, ['failed', 'problematic', 'blocked'], true))
                ->count(),
            'rejected_children' => $rejectedStatuses->count(),
            'queued_children' => $queuedStatuses->count(),
            'approved_children' => $approvedStatuses->count(),
            'partial_children' => $partialChildren,
            'last_batch_request_id' => $latestBatchStatus?->batch_request_id,
            'last_sent_at' => $latestSentStatus?->last_sent_at,
            'last_checked_at' => $latestCheckedStatus?->last_checked_at,
            'problem_children' => $statuses
                ->filter(fn ($status) => in_array($status->status, ['failed', 'rejected', 'problematic', 'blocked'], true))
                ->sortByDesc(fn ($status) => $this->statusTimestamp($status))
                ->take(self::PROBLEM_CHILDREN_LIMIT)
                ->map(fn ($status) => [
                    'product_id' => $status->product_id,
                    'name' => $status->product?->name,
                    'sku' => $status->product?->sku,
                    'barcode' => $status->product?->barcode,
                    'parent_product_id' => $status->product?->parent_product_id,
                    'variant_group_key' => $status->product?->variant_group_key,
                    'marketplace_code' => $status->marketplace_code,
                    'status' => in_array($status->status, $knownStatuses, true) ? $status->status : 'mixed',
                    'error_message' => $status->error_message,
                    'batch_request_id' => $status->batch_request_id,
                    'last_checked_at' => $status->last_checked_at,
                    'readiness_missing_fields' => $this->readinessMissingFields($status->product, $marketplace),
                    'readiness_score' => $this->readinessScore($status->product, $marketplace),
                ])
                ->values()
                ->all(),
        ];
    }

    private function rollupStatus(Collection $statuses, Collection $readinessStatuses, int $totalChildren): string
    {
        if ($totalChildren === 0) {
            return 'not_ready';
        }

        $known = ['ready', 'not_ready', 'queued', 'sent', 'failed', 'approved', 'rejected', 'problematic', 'blocked'];
        if ($statuses->contains(fn (string $status) => in_array($status, ['failed', 'problematic', 'blocked'], true))) {
            return 'failed';
        }

        if ($statuses->contains('rejected')) {
            return 'rejected';
        }

        if ($statuses->contains(fn (string $status) => ! in_array($status, $known, true))) {
            return 'mixed';
        }

        if ($statuses->count() === $totalChildren && $statuses->every(fn (string $status) => $status === 'approved')) {
            return 'approved';
        }

        if ($statuses->contains(fn (string $status) => in_array($status, ['queued', 'sent'], true))) {
            return $statuses->count() === $totalChildren ? 'queued' : 'partial';
        }

        if ($readinessStatuses->count() === $totalChildren && $readinessStatuses->every(fn (string $status) => $status === 'ready')) {
            return 'ready';
        }

        if ($readinessStatuses->contains('ready')) {
            return 'partial';
        }

        return 'not_ready';
    }

    private function latestStatusWith(Collection $statuses, string $field): mixed
    {
        return $statuses
            ->filter(fn ($status) => filled($status->{$field}))
            ->sortByDesc(fn ($status) => $this->statusTimestamp($status))
            ->first();
    }

    private function statusTimestamp($status): int
    {
        foreach ([$status->last_checked_at, $status->last_sent_at, $status->updated_at, $status->created_at] as $date) {
            if (! $date) {
                continue;
            }

            return $date instanceof \DateTimeInterface ? $date->getTimestamp() : (strtotime((string) $date) ?: 0);
        }

        return 0;
    }

    private function readinessMissingFields(?Product $product, string $marketplace): array
    {
        $report = $product?->marketplace_readiness[$marketplace] ?? null;

        return is_array($report) ? ($report['missing_fields'] ?? []) : [];
    }

    private function readinessScore(?Product $product, string $marketplace): int
    {
        $report = $product?->marketplace_readiness[$marketplace] ?? null;

        return is_array($report) ? (int) ($report['score'] ?? 0) : 0;
    }

    private function children(Product $product): Collection
    {
        $product->loadMissing([
            'variants.marketplaceStatuses',
        ]);

        return $product->variants;
    }
}
