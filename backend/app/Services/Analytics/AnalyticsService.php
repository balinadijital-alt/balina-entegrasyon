<?php

namespace App\Services\Analytics;

use App\Models\ApiLog;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\ProductMarketplaceStatus;
use App\Models\Shipment;
use App\Models\Subscription;
use App\Models\SyncRun;
use App\Models\UsageCounter;
use App\Models\WebhookDeliveryLog;
use App\Models\XmlSource;
use App\Services\Products\ProductVariantRollupService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class AnalyticsService
{
    public function overview(array $filters = []): array
    {
        $from = $this->date($filters['from'] ?? null, CarbonImmutable::today()->subDays(29))->startOfDay();
        $to = $this->date($filters['to'] ?? null, CarbonImmutable::today())->endOfDay();
        $companyId = $filters['company_id'] ?? null;
        $marketplaceCode = $filters['marketplace_code'] ?? null;
        $cacheKey = sprintf(
            'analytics:overview:%s:%s:%s:%s',
            $companyId ?: 'all',
            $marketplaceCode ?: 'all',
            $from->toDateString(),
            $to->toDateString()
        );

        return Cache::remember($cacheKey, now()->addMinutes(5), fn () => [
            'filters' => [
                'from' => $from->toDateString(),
                'to' => $to->toDateString(),
                'company_id' => $companyId,
                'marketplace_code' => $marketplaceCode,
            ],
            'sales' => $this->sales($from, $to, $companyId, $marketplaceCode),
            'orders' => $this->orders($from, $to, $companyId, $marketplaceCode),
            'payments' => $this->payments($from, $to, $companyId, $marketplaceCode),
            'shipping' => $this->shipping($from, $to, $companyId, $marketplaceCode),
            'imports' => $this->imports($from, $to, $companyId),
            'queue' => Cache::remember("analytics:queue:".($companyId ?: 'all').":{$from->timestamp}:{$to->timestamp}", now()->addMinute(), fn () => $this->queue($from, $to, $companyId)),
            'api' => Cache::remember("analytics:api:".($companyId ?: 'all').':'.($marketplaceCode ?: 'all').":{$from->timestamp}:{$to->timestamp}", now()->addMinute(), fn () => $this->api($from, $to, $companyId, $marketplaceCode)),
            'webhooks' => $this->webhooks($from, $to, $companyId, $marketplaceCode),
            'saas' => $this->saas($from, $to, $companyId),
            'marketplaces' => $this->marketplaces($companyId, $marketplaceCode),
            'xml_intelligence' => Cache::remember(
                "analytics:xml-intelligence:".($companyId ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinutes(5),
                fn () => $this->xmlIntelligence($from, $to, $companyId)
            ),
            'product_intelligence' => Cache::remember(
                "analytics:product-intelligence:".($companyId ?: 'all').':'.($marketplaceCode ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinutes(5),
                fn () => $this->productIntelligence($from, $to, $companyId, $marketplaceCode)
            ),
            'alerts' => $this->alerts($from, $to, $companyId, $marketplaceCode),
        ]);
    }

    private function sales(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $orders = $this->ordersQuery($from, $to, $companyId, $marketplaceCode);
        $orderCount = (clone $orders)->count();
        $totalSales = (float) (clone $orders)->sum('total_amount');

        return [
            'total_sales' => round($totalSales, 2),
            'order_count' => $orderCount,
            'avg_order_value' => $orderCount > 0 ? round($totalSales / $orderCount, 2) : 0,
            'trend' => $this->dailySeries($from, $to, fn ($day) => (float) $this->ordersQuery($day->startOfDay(), $day->endOfDay(), $companyId, $marketplaceCode)->sum('total_amount')),
        ];
    }

    private function orders(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        return [
            'pending' => $this->ordersQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['new', 'pending'])->count(),
            'preparing' => $this->ordersQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['processing', 'preparing', 'ready_to_ship'])->count(),
            'shipped' => $this->ordersQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['shipped', 'in_transit'])->count(),
            'delivered' => $this->ordersQuery($from, $to, $companyId, $marketplaceCode)->where('status', 'delivered')->count(),
            'cancelled' => $this->ordersQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['cancelled', 'canceled', 'returned', 'refunded'])->count(),
            'trend' => $this->dailySeries($from, $to, fn ($day) => $this->ordersQuery($day->startOfDay(), $day->endOfDay(), $companyId, $marketplaceCode)->count()),
        ];
    }

    private function payments(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        return [
            'paid' => $this->paymentQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['paid', 'completed', 'success'])->count(),
            'failed' => $this->paymentQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['failed', 'cancelled', 'canceled'])->count(),
            'refunded' => $this->paymentQuery($from, $to, $companyId, $marketplaceCode)->where(function ($query) {
                $query->whereIn('status', ['refunded', 'partial_refund'])->orWhere('refunded_amount', '>', 0);
            })->count(),
        ];
    }

    private function shipping(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        return [
            'delivered' => $this->shipmentQuery($from, $to, $companyId, $marketplaceCode)->where('status', 'delivered')->count(),
            'pending' => $this->shipmentQuery($from, $to, $companyId, $marketplaceCode)->whereIn('status', ['queued', 'pending', 'created', 'in_transit', 'shipped'])->count(),
            'failed' => $this->shipmentQuery($from, $to, $companyId, $marketplaceCode)->where(function ($query) {
                $query->whereIn('status', ['failed', 'cancelled', 'problematic'])->orWhereNotNull('error_message');
            })->count(),
        ];
    }

    private function imports(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $runs = ProductImportRun::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereBetween('created_at', [$from, $to]);

        return [
            'successful_runs' => (clone $runs)->whereIn('status', ['completed', 'success'])->count(),
            'failed_runs' => (clone $runs)->whereIn('status', ['failed', 'cancelled'])->count(),
            'filtered_rows' => (int) (clone $runs)->get()->sum(fn (ProductImportRun $run) => (int) data_get($run->report, 'filtered_count', data_get($run->report, 'filtered_rows_count', count(data_get($run->report, 'filtered_rows', []))))),
            'conflict_rows' => (int) (clone $runs)->get()->sum(fn (ProductImportRun $run) => (int) data_get($run->report, 'conflict_count', count(data_get($run->report, 'conflict_rows', [])))),
        ];
    }

    private function queue(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $syncRuns = SyncRun::query()
            ->when($companyId, fn ($query) => $query->whereHas('marketplace.company', fn ($company) => $company->where('id', $companyId)))
            ->whereBetween('created_at', [$from, $to]);

        $globalPending = $companyId ? 0 : DB::table('jobs')->count();
        $globalFailed = $companyId ? 0 : DB::table('failed_jobs')->count();

        return [
            'pending_jobs' => (clone $syncRuns)->whereIn('status', ['queued', 'pending', 'running'])->count() + $globalPending,
            'failed_jobs' => (clone $syncRuns)->where('status', 'failed')->count() + $globalFailed,
            'retry_jobs' => (clone $syncRuns)->where('attempts', '>', 0)->count(),
        ];
    }

    private function api(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $logs = ApiLog::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->whereBetween('created_at', [$from, $to]);

        return [
            'api_errors' => (clone $logs)->where('status_code', '>=', 400)->count(),
            'slow_requests' => (clone $logs)->where('duration_ms', '>=', 1000)->count(),
            'total_requests' => (clone $logs)->count(),
        ];
    }

    private function webhooks(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $inbound = InboundWebhookDelivery::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->whereBetween('created_at', [$from, $to]);
        $outbound = WebhookDeliveryLog::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereBetween('created_at', [$from, $to]);

        return [
            'inbound_success' => (clone $inbound)->where('status', 'processed')->count(),
            'inbound_failed' => (clone $inbound)->whereIn('status', ['failed', 'invalid_signature', 'unknown_account'])->count(),
            'outbound_success' => (clone $outbound)->where('success', true)->count(),
            'outbound_failed' => (clone $outbound)->where(function ($query) {
                $query->whereIn('status', ['failed', 'error'])->orWhereNotNull('failed_at');
            })->count(),
        ];
    }

    private function saas(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $subscriptions = Subscription::query()->when($companyId, fn ($query) => $query->where('company_id', $companyId));
        $limitRisk = UsageCounter::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('limit', '>', 0)
            ->get()
            ->filter(fn (UsageCounter $counter) => ((int) $counter->used / max((int) $counter->limit, 1)) >= 0.9)
            ->pluck('company_id')
            ->unique()
            ->count();

        return [
            'active_subscriptions' => (clone $subscriptions)->whereIn('status', ['active', 'trial'])->count(),
            'expiring_subscriptions' => (clone $subscriptions)->whereIn('status', ['active', 'trial'])->where(function ($query) use ($from, $to) {
                $query->whereBetween('ends_at', [$from, $to])->orWhereBetween('trial_ends_at', [$from, $to]);
            })->count(),
            'limit_risk_companies' => $limitRisk,
        ];
    }

    private function marketplaces(?int $companyId, ?string $marketplaceCode): array
    {
        $accounts = MarketplaceAccount::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('code', $marketplaceCode));

        return [
            'active_accounts' => (clone $accounts)->where('is_active', true)->count(),
            'failed_accounts' => (clone $accounts)->where('connection_status', 'failed')->count(),
        ];
    }

    private function alerts(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $failedImports = ProductImportRun::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['failed', 'cancelled'])
            ->count();
        $failedQueue = $this->queue($from, $to, $companyId)['failed_jobs'];
        $rejectedVariants = ProductMarketplaceStatus::query()
            ->whereIn('status', ['rejected', 'failed', 'problematic'])
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->when($companyId, fn ($query) => $query->whereHas('product', fn ($product) => $product->where('company_id', $companyId)))
            ->whereBetween('updated_at', [$from, $to])
            ->count();
        $failedWebhooks = $this->webhooks($from, $to, $companyId, $marketplaceCode)['inbound_failed'] + $this->webhooks($from, $to, $companyId, $marketplaceCode)['outbound_failed'];
        $expiringSubscriptions = $this->saas($from, $to, $companyId)['expiring_subscriptions'];

        return collect([
            ['key' => 'failed_imports', 'label' => 'Failed imports', 'value' => $failedImports, 'tone' => $failedImports > 0 ? 'critical' : 'healthy'],
            ['key' => 'failed_queue_jobs', 'label' => 'Failed queue jobs', 'value' => $failedQueue, 'tone' => $failedQueue > 0 ? 'critical' : 'healthy'],
            ['key' => 'rejected_variants', 'label' => 'Rejected variants', 'value' => $rejectedVariants, 'tone' => $rejectedVariants > 0 ? 'warning' : 'healthy'],
            ['key' => 'failed_webhooks', 'label' => 'Failed webhooks', 'value' => $failedWebhooks, 'tone' => $failedWebhooks > 0 ? 'warning' : 'healthy'],
            ['key' => 'expiring_subscriptions', 'label' => 'Expiring subscriptions', 'value' => $expiringSubscriptions, 'tone' => $expiringSubscriptions > 0 ? 'warning' : 'healthy'],
        ])->filter(fn (array $alert) => $alert['value'] > 0)->values()->all();
    }

    private function xmlIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $sources = XmlSource::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->with(['importRuns' => fn ($query) => $query->whereBetween('created_at', [$from, $to])->latest()])
            ->latest('last_import_at')
            ->get();
        $runs = ProductImportRun::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->with('xmlSource:id,name,supplier_name')
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $totalRows = (int) $runs->sum('total_rows');
        $processedRows = (int) $runs->sum('processed_rows');
        $conflicts = $this->sumRunReport($runs, 'conflict_count', 'conflict_rows');
        $filtered = $this->sumRunReport($runs, 'filtered_count', 'filtered_rows');
        $sourceRows = $sources->map(function (XmlSource $source) {
            $latestRun = $source->importRuns->first();
            $health = $this->xmlSourceHealth($source, $latestRun);

            return [
                'source_id' => $source->id,
                'source_name' => $source->name,
                'supplier_name' => $source->supplier_name,
                'health' => $health,
                'last_status' => $source->last_status,
                'last_import_at' => $source->last_import_at,
                'last_error' => $source->last_error,
            ];
        })->values();

        return [
            'health_summary' => [
                'total_sources' => $sourceRows->count(),
                'healthy_sources' => $sourceRows->where('health', 'healthy')->count(),
                'warning_sources' => $sourceRows->where('health', 'warning')->count(),
                'critical_sources' => $sourceRows->where('health', 'critical')->count(),
            ],
            'sources' => $sourceRows->take(50)->values()->all(),
            'performance' => [
                'total_runs' => $runs->count(),
                'successful_runs' => $runs->whereIn('status', ['completed', 'completed_with_errors', 'success'])->count(),
                'failed_runs' => $runs->whereIn('status', ['failed', 'cancelled'])->count(),
                'total_rows' => $totalRows,
                'processed_rows' => $processedRows,
                'created_count' => (int) $runs->sum('created_count'),
                'updated_count' => (int) $runs->sum('updated_count'),
                'skipped_count' => (int) $runs->sum('skipped_count'),
            ],
            'conflicts' => [
                'total_conflicts' => $conflicts,
                'conflict_rate' => $processedRows > 0 ? round(($conflicts / $processedRows) * 100, 2) : 0,
                'conflict_sources' => $this->conflictSources($runs),
                'sample_conflicts' => $this->sampleRunRows($runs, 'conflict_rows', 100),
            ],
            'mapping' => $this->mappingIntelligence($runs),
            'filters' => [
                'filtered_count' => $filtered,
                'filter_rate' => $processedRows > 0 ? round(($filtered / $processedRows) * 100, 2) : 0,
                'filter_reason_breakdown' => $this->filterReasonBreakdown($runs),
            ],
            'trends' => [
                'daily_runs' => $this->dailySeries($from, $to, fn ($day) => ProductImportRun::query()
                    ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
                    ->whereBetween('created_at', [$day->startOfDay(), $day->endOfDay()])
                    ->count()),
                'daily_errors' => $this->dailySeries($from, $to, fn ($day) => (int) ProductImportRun::query()
                    ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
                    ->whereBetween('created_at', [$day->startOfDay(), $day->endOfDay()])
                    ->sum('error_count')),
                'daily_conflicts' => $this->dailySeries($from, $to, fn ($day) => $this->sumRunReport(ProductImportRun::query()
                    ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
                    ->whereBetween('created_at', [$day->startOfDay(), $day->endOfDay()])
                    ->get(), 'conflict_count', 'conflict_rows')),
                'daily_filtered' => $this->dailySeries($from, $to, fn ($day) => $this->sumRunReport(ProductImportRun::query()
                    ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
                    ->whereBetween('created_at', [$day->startOfDay(), $day->endOfDay()])
                    ->get(), 'filtered_count', 'filtered_rows')),
            ],
        ];
    }

    private function productIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $products = Product::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->with(['variants.marketplaceStatuses', 'marketplaceStatuses'])
            ->get();
        $providerProducts = $products->filter(fn (Product $product) => $product->product_type !== 'parent');
        $variantChildren = $products->filter(fn (Product $product) => $product->product_type === 'variant');
        $parentProducts = $products->filter(fn (Product $product) => $product->product_type === 'parent');
        $scores = [];
        $readyProducts = 0;
        $missingFields = [];
        $marketplaces = $marketplaceCode ? [$marketplaceCode] : ['trendyol', 'hepsiburada'];

        foreach ($providerProducts as $product) {
            $reports = collect($product->marketplace_readiness ?? [])
                ->when($marketplaceCode, fn ($collection) => $collection->only([$marketplaceCode]));
            $isReady = $reports->isNotEmpty() && $reports->every(fn (array $report) => (bool) ($report['ready'] ?? false));

            if ($isReady) {
                $readyProducts++;
            }

            foreach ($reports as $report) {
                $scores[] = (int) ($report['score'] ?? 0);
                foreach ($report['missing_fields'] ?? [] as $field) {
                    $missingFields[$field] = ($missingFields[$field] ?? 0) + 1;
                }
            }
        }

        arsort($missingFields);
        $parentHealth = $this->parentHealth($parentProducts);
        $readyVariantChildren = $variantChildren->filter(fn (Product $product) => collect($product->marketplace_readiness ?? [])
            ->when($marketplaceCode, fn ($collection) => $collection->only([$marketplaceCode]))
            ->isNotEmpty()
            && collect($product->marketplace_readiness ?? [])
                ->when($marketplaceCode, fn ($collection) => $collection->only([$marketplaceCode]))
                ->every(fn (array $report) => (bool) ($report['ready'] ?? false))
        )->count();
        $xmlOwned = $products->whereNotNull('xml_source_id')->count();
        $sourceCodeFilled = $products->whereNotNull('source_product_code')->count();

        return [
            'readiness' => [
                'total_products' => $providerProducts->count(),
                'ready_products' => $readyProducts,
                'blocked_products' => max(0, $providerProducts->count() - $readyProducts),
                'readiness_rate' => $providerProducts->count() > 0 ? round(($readyProducts / $providerProducts->count()) * 100, 2) : 0,
                'avg_readiness_score' => $scores === [] ? 0 : (int) round(array_sum($scores) / count($scores)),
            ],
            'ownership' => [
                'xml_owned_products' => $xmlOwned,
                'products_without_owner' => $products->whereNull('xml_source_id')->count(),
                'source_product_code_coverage' => $xmlOwned > 0 ? round(($sourceCodeFilled / $xmlOwned) * 100, 2) : 0,
                'stale_xml_products' => $products
                    ->whereNotNull('xml_source_id')
                    ->filter(fn (Product $product) => ! $product->last_xml_sync_at || $product->last_xml_sync_at->lt($to->copy()->subDays(7)))
                    ->count(),
            ],
            'variants' => [
                'parent_count' => $parentProducts->count(),
                'child_count' => $variantChildren->count(),
                'ready_variant_children' => $readyVariantChildren,
                'blocked_variant_children' => max(0, $variantChildren->count() - $readyVariantChildren),
                'orphan_variants' => $variantChildren->whereNull('parent_product_id')->count(),
                'parents_with_problem_children' => $parentHealth['problem_parents'],
            ],
            'parent_child' => [
                'avg_children_per_parent' => $parentProducts->count() > 0 ? round($variantChildren->whereNotNull('parent_product_id')->count() / $parentProducts->count(), 2) : 0,
                'parents_without_children' => $parentProducts->filter(fn (Product $product) => $product->variants->isEmpty())->count(),
                'parent_health_summary' => $parentHealth['summary'],
                'problem_parents' => $parentHealth['rows'],
            ],
            'marketplace_readiness' => collect($marketplaces)
                ->mapWithKeys(fn (string $marketplace) => [$marketplace => $this->marketplaceReadinessIntelligence($providerProducts, $marketplace)])
                ->all(),
            'missing_field_heatmap' => $this->missingFieldHeatmap($missingFields),
        ];
    }

    private function xmlSourceHealth(XmlSource $source, ?ProductImportRun $latestRun): string
    {
        if (! $source->is_active) {
            return 'warning';
        }

        if ($source->last_status === 'failed' || filled($source->last_error) || $latestRun?->status === 'failed') {
            return 'critical';
        }

        if (! $source->last_import_at) {
            return 'warning';
        }

        $expectedMinutes = max((int) $source->frequency_minutes, 60);
        if ($source->last_import_at->lt(now()->subMinutes($expectedMinutes * 3))) {
            return 'warning';
        }

        if ($latestRun) {
            $processedRows = max((int) $latestRun->processed_rows, 1);
            $errorRate = ((int) $latestRun->error_count / $processedRows) * 100;
            $conflictRate = ($this->runReportCount($latestRun, 'conflict_count', 'conflict_rows') / $processedRows) * 100;

            if ($errorRate > 20 || $conflictRate > 10) {
                return 'critical';
            }

            if ($latestRun->status === 'completed_with_errors' || $errorRate > 5 || $conflictRate > 0) {
                return 'warning';
            }
        }

        return 'healthy';
    }

    private function mappingIntelligence(\Illuminate\Support\Collection $runs): array
    {
        $mappedCategory = $this->sumRunReport($runs, 'mapped_category_count');
        $mappedBrand = $this->sumRunReport($runs, 'mapped_brand_count');
        $unmappedCategory = $this->sumRunReport($runs, 'unmapped_category_count');
        $unmappedBrand = $this->sumRunReport($runs, 'unmapped_brand_count');

        return [
            'mapped_category_count' => $mappedCategory,
            'mapped_brand_count' => $mappedBrand,
            'unmapped_category_count' => $unmappedCategory,
            'unmapped_brand_count' => $unmappedBrand,
            'category_mapping_success_rate' => ($mappedCategory + $unmappedCategory) > 0 ? round(($mappedCategory / ($mappedCategory + $unmappedCategory)) * 100, 2) : 0,
            'brand_mapping_success_rate' => ($mappedBrand + $unmappedBrand) > 0 ? round(($mappedBrand / ($mappedBrand + $unmappedBrand)) * 100, 2) : 0,
        ];
    }

    private function conflictSources(\Illuminate\Support\Collection $runs): array
    {
        return $runs
            ->groupBy('xml_source_id')
            ->map(function ($sourceRuns) {
                $first = $sourceRuns->first();

                return [
                    'xml_source_id' => $first->xml_source_id,
                    'source_name' => $first->xmlSource?->name,
                    'supplier_name' => $first->xmlSource?->supplier_name ?? $first->supplier_name,
                    'conflict_count' => $this->sumRunReport($sourceRuns, 'conflict_count', 'conflict_rows'),
                ];
            })
            ->filter(fn (array $row) => $row['conflict_count'] > 0)
            ->sortByDesc('conflict_count')
            ->take(20)
            ->values()
            ->all();
    }

    private function filterReasonBreakdown(\Illuminate\Support\Collection $runs): array
    {
        return $runs
            ->flatMap(fn (ProductImportRun $run) => data_get($run->report, 'filtered_rows', []))
            ->map(fn (array $row) => (string) ($row['reason'] ?? 'unknown'))
            ->filter()
            ->countBy()
            ->sortDesc()
            ->map(fn (int $count, string $reason) => ['reason' => $reason, 'count' => $count])
            ->values()
            ->all();
    }

    private function sampleRunRows(\Illuminate\Support\Collection $runs, string $key, int $limit): array
    {
        return $runs
            ->flatMap(fn (ProductImportRun $run) => collect(data_get($run->report, $key, []))->map(fn (array $row) => [
                ...$row,
                'import_run_id' => $run->id,
                'xml_source_id' => $run->xml_source_id,
                'source_name' => $run->xmlSource?->name,
            ]))
            ->take($limit)
            ->values()
            ->all();
    }

    private function sumRunReport(\Illuminate\Support\Collection $runs, string $countKey, ?string $rowsKey = null): int
    {
        return (int) $runs->sum(fn (ProductImportRun $run) => $this->runReportCount($run, $countKey, $rowsKey));
    }

    private function runReportCount(ProductImportRun $run, string $countKey, ?string $rowsKey = null): int
    {
        $value = data_get($run->report, $countKey);

        if ($value !== null) {
            return (int) $value;
        }

        if ($rowsKey !== null) {
            return count(data_get($run->report, $rowsKey, []));
        }

        return 0;
    }

    private function parentHealth(\Illuminate\Support\Collection $parents): array
    {
        $rollup = new ProductVariantRollupService();
        $summary = ['healthy' => 0, 'warning' => 0, 'critical' => 0];
        $problemParents = 0;
        $rows = [];

        foreach ($parents as $parent) {
            $readiness = $rollup->readiness($parent);
            $statuses = $rollup->marketplaceStatuses($parent);
            $problemCount = collect($statuses)
                ->sum(fn (array $status) => (int) ($status['failed_children'] ?? 0) + (int) ($status['rejected_children'] ?? 0));
            $health = $problemCount > 0 ? 'critical' : (((int) data_get($readiness, 'blocked_children', 0)) > 0 ? 'warning' : 'healthy');
            $summary[$health]++;

            if ($problemCount > 0 || $health !== 'healthy') {
                $problemParents++;
                if (count($rows) < 50) {
                    $rows[] = [
                        'product_id' => $parent->id,
                        'sku' => $parent->sku,
                        'name' => $parent->name,
                        'variant_group_key' => $parent->variant_group_key,
                        'health' => $health,
                        'total_children' => (int) data_get($readiness, 'total_children', 0),
                        'ready_children' => (int) data_get($readiness, 'ready_children', 0),
                        'blocked_children' => (int) data_get($readiness, 'blocked_children', 0),
                        'problem_children' => $problemCount,
                    ];
                }
            }
        }

        return ['summary' => $summary, 'problem_parents' => $problemParents, 'rows' => $rows];
    }

    private function marketplaceReadinessIntelligence(\Illuminate\Support\Collection $products, string $marketplace): array
    {
        $reports = $products
            ->map(fn (Product $product) => $product->marketplace_readiness[$marketplace] ?? null)
            ->filter(fn ($report) => is_array($report))
            ->values();
        $ready = $reports->filter(fn (array $report) => (bool) ($report['ready'] ?? false))->count();
        $scores = $reports->map(fn (array $report) => (int) ($report['score'] ?? 0))->all();

        return [
            'ready' => $ready,
            'blocked' => max(0, $reports->count() - $ready),
            'avg_score' => $scores === [] ? 0 : (int) round(array_sum($scores) / count($scores)),
        ];
    }

    private function missingFieldHeatmap(array $missingFields): array
    {
        $fields = ['barcode', 'sku', 'brand', 'category', 'image', 'description', 'category_mapping', 'attributes'];

        return collect($fields)
            ->map(fn (string $field) => ['field' => $field, 'count' => (int) ($missingFields[$field] ?? 0)])
            ->sortByDesc('count')
            ->values()
            ->all();
    }

    private function ordersQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): Builder
    {
        return Order::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->whereBetween('created_at', [$from, $to]);
    }

    private function paymentQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): Builder
    {
        return Payment::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId || $marketplaceCode, fn ($query) => $query->whereHas('order', function ($order) use ($companyId, $marketplaceCode) {
                $order->when($companyId, fn ($inner) => $inner->where('company_id', $companyId))
                    ->when($marketplaceCode, fn ($inner) => $inner->where('marketplace_code', $marketplaceCode));
            }));
    }

    private function shipmentQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): Builder
    {
        return Shipment::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId || $marketplaceCode, fn ($query) => $query->whereHas('order', function ($order) use ($companyId, $marketplaceCode) {
                $order->when($companyId, fn ($inner) => $inner->where('company_id', $companyId))
                    ->when($marketplaceCode, fn ($inner) => $inner->where('marketplace_code', $marketplaceCode));
            }));
    }

    private function dailySeries(CarbonImmutable $from, CarbonImmutable $to, callable $resolver): array
    {
        $days = min(31, $from->diffInDays($to) + 1);

        return collect(range(0, max(0, $days - 1)))
            ->map(function (int $offset) use ($from, $resolver) {
                $day = $from->addDays($offset);

                return ['label' => $day->format('d.m'), 'value' => $resolver($day)];
            })
            ->values()
            ->all();
    }

    private function date(?string $value, CarbonImmutable $fallback): CarbonImmutable
    {
        if (! $value) {
            return $fallback;
        }

        return CarbonImmutable::parse($value);
    }
}
