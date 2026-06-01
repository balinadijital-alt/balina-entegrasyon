<?php

namespace App\Services\Analytics;

use App\Models\ApiLog;
use App\Models\InboundWebhookDelivery;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductImportRun;
use App\Models\ProductMarketplaceStatus;
use App\Models\Shipment;
use App\Models\Subscription;
use App\Models\SyncRun;
use App\Models\UsageCounter;
use App\Models\WebhookDeliveryLog;
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
