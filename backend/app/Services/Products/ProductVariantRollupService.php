<?php

namespace App\Services\Products;

use App\Models\Product;
use Illuminate\Support\Collection;

class ProductVariantRollupService
{
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];

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
            ->map(fn (Product $child) => $child->marketplaceStatuses->firstWhere('marketplace_code', $marketplace))
            ->filter()
            ->values();

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
                ->filter(fn ($status) => in_array($status->status, ['failed', 'rejected', 'problematic', 'blocked'], true))
                ->count(),
            'queued_children' => $statuses
                ->filter(fn ($status) => in_array($status->status, ['queued', 'sent'], true))
                ->count(),
            'approved_children' => $statuses
                ->filter(fn ($status) => $status->status === 'approved')
                ->count(),
        ];
    }

    private function rollupStatus(Collection $statuses, Collection $readinessStatuses, int $totalChildren): string
    {
        if ($totalChildren === 0) {
            return 'not_ready';
        }

        $known = ['ready', 'not_ready', 'queued', 'sent', 'failed', 'approved', 'rejected', 'problematic', 'blocked'];
        if ($statuses->contains(fn (string $status) => ! in_array($status, $known, true))) {
            return 'mixed';
        }

        if ($statuses->contains(fn (string $status) => in_array($status, ['failed', 'rejected', 'problematic', 'blocked'], true))) {
            return 'failed';
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

    private function children(Product $product): Collection
    {
        $product->loadMissing([
            'variants.marketplaceStatuses',
        ]);

        return $product->variants;
    }
}
