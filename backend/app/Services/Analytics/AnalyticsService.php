<?php

namespace App\Services\Analytics;

use App\Models\ApiLog;
use App\Models\AccountingAccount;
use App\Models\AccountingLog;
use App\Models\Company;
use App\Models\InboundWebhookDelivery;
use App\Models\Invoice;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Models\PaymentProvider;
use App\Models\Product;
use App\Models\ProductImportRun;
use App\Models\ProductMarketplaceStatus;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
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
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];

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
            'marketplace_intelligence' => Cache::remember(
                "analytics:marketplace-intelligence:".($companyId ?: 'all').':'.($marketplaceCode ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinutes(5),
                fn () => $this->marketplaceIntelligence($from, $to, $companyId, $marketplaceCode)
            ),
            'operations_intelligence' => Cache::remember(
                "analytics:operations-intelligence:".($companyId ?: 'all').':'.($marketplaceCode ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinute(),
                fn () => $this->operationsIntelligence($from, $to, $companyId, $marketplaceCode)
            ),
            'finance_intelligence' => Cache::remember(
                "analytics:finance-intelligence:".($companyId ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinutes(5),
                fn () => $this->financeIntelligence($from, $to, $companyId)
            ),
            'logistics_intelligence' => Cache::remember(
                "analytics:logistics-intelligence:".($companyId ?: 'all').":{$from->timestamp}:{$to->timestamp}",
                now()->addMinutes(5),
                fn () => $this->logisticsIntelligence($from, $to, $companyId)
            ),
            'alerts' => $this->alerts($from, $to, $companyId, $marketplaceCode),
        ]);
    }

    public function marketplaceDrilldown(string $marketplaceCode, array $filters = []): array
    {
        $marketplaceCode = strtolower($marketplaceCode);
        $from = $this->date($filters['from'] ?? null, CarbonImmutable::today()->subDays(29))->startOfDay();
        $to = $this->date($filters['to'] ?? null, CarbonImmutable::today())->endOfDay();
        $companyId = $filters['company_id'] ?? null;

        return Cache::remember(
            "analytics:marketplace-drilldown:".($companyId ?: 'all').":{$marketplaceCode}:{$from->timestamp}:{$to->timestamp}",
            now()->addMinutes(3),
            function () use ($from, $to, $companyId, $marketplaceCode) {
                $marketplace = $this->marketplacePerformance($from, $to, $companyId, $marketplaceCode);
                $batch = $this->batchSuccessAnalytics($from, $to, $companyId, $marketplaceCode);
                $rejectedProducts = $this->marketplaceProductStatusRows($from, $to, $companyId, $marketplaceCode, ['rejected'], 50);
                $failedProducts = $this->marketplaceProductStatusRows($from, $to, $companyId, $marketplaceCode, ['failed', 'problematic', 'blocked'], 50);
                $api = $this->apiErrorIntelligence($from, $to, $companyId, $marketplaceCode);
                $apiErrors = $this->apiErrorRows($from, $to, $companyId, $marketplaceCode, 50);
                $queue = $this->queueFailures($from, $to, $companyId, $marketplaceCode, 20);
                $webhooks = $this->webhookFailures($from, $to, $companyId, $marketplaceCode, 20);
                $variantProblems = $this->variantProblemAnalytics($companyId, $marketplaceCode);
                $staleSync = $this->staleSync($marketplaceCode, $companyId);
                $risk = $this->operationalRiskScore(
                    [
                        'marketplaces' => [$marketplaceCode => $marketplace],
                        'batch_success' => $batch,
                        'variant_problems' => $variantProblems,
                    ],
                    [
                        'failed_jobs' => count($queue),
                    ],
                    $api,
                    [
                        'inbound_total' => max(1, count($webhooks)),
                        'inbound_failed' => count($webhooks),
                        'outbound_total' => 0,
                        'outbound_failed' => 0,
                    ]
                );
                $summary = [
                    'failed_batches' => count($batch['problem_batches'] ?? []),
                    'rejected_products' => count($rejectedProducts),
                    'failed_products' => count($failedProducts),
                    'api_errors' => (int) ($api['api_errors'] ?? 0),
                    'slow_requests' => (int) ($api['slow_requests'] ?? 0),
                    'queue_failures' => count($queue),
                    'webhook_failures' => count($webhooks),
                    'variant_problem_children' => (int) ($variantProblems['problem_children_count'] ?? 0),
                    'stale_sync' => (bool) ($staleSync['is_stale'] ?? false),
                ];
                $incidents = $this->buildMarketplaceIncidents(
                    $marketplaceCode,
                    $marketplace,
                    $summary,
                    $batch,
                    $api,
                    $queue,
                    $webhooks,
                    $variantProblems,
                    $staleSync
                );

                return [
                    'marketplace' => [
                        'code' => $marketplaceCode,
                        'label' => $this->marketplaceLabel($marketplaceCode),
                        'health' => $marketplace['health'],
                        'active_accounts' => $marketplace['active_accounts'],
                        'failed_accounts' => $marketplace['failed_accounts'],
                        'last_product_sync_at' => $marketplace['last_product_sync_at'],
                        'last_price_sync_at' => $marketplace['last_price_sync_at'],
                        'last_order_sync_at' => $marketplace['last_order_sync_at'],
                        'last_error' => $marketplace['last_error'],
                    ],
                    'risk_score' => $risk,
                    'summary' => $summary,
                    'incidents' => $incidents,
                    'failed_products' => $failedProducts,
                    'rejected_products' => $rejectedProducts,
                    'batch_problems' => array_slice($batch['problem_batches'] ?? [], 0, 50),
                    'api_errors' => $apiErrors,
                    'queue_failures' => $queue,
                    'webhook_failures' => $webhooks,
                    'variant_problems' => [
                        ...$variantProblems,
                        'latest_problem_children' => array_slice($variantProblems['latest_problem_children'] ?? [], 0, 100),
                    ],
                    'stale_sync' => $staleSync,
                    'action_links' => $this->marketplaceActionLinks($marketplaceCode),
                ];
            }
        );
    }

    public function executive(array $filters = []): array
    {
        $from = $this->date($filters['from'] ?? null, CarbonImmutable::today()->subDays(29))->startOfDay();
        $to = $this->date($filters['to'] ?? null, CarbonImmutable::today())->endOfDay();
        $companyId = $filters['company_id'] ?? null;
        $plan = $filters['plan'] ?? null;
        $health = $filters['health'] ?? null;
        $cacheKey = sprintf(
            'analytics:executive:%s:%s:%s:%s:%s',
            $companyId ?: 'all',
            $plan ?: 'all',
            $health ?: 'all',
            $from->toDateString(),
            $to->toDateString()
        );

        return Cache::remember($cacheKey, now()->addMinutes(5), function () use ($from, $to, $companyId, $plan, $health) {
            $business = $this->executiveBusinessMetrics($from, $to, $companyId);
            $saas = $this->executiveSaasIntelligence($from, $to, $companyId);
            $finance = $this->financeIntelligence($from, $to, $companyId);
            $logistics = $this->logisticsIntelligence($from, $to, $companyId);
            $scorecards = $this->tenantScorecards($from, $to, $companyId, $plan, $health);
            $riskOverview = [
                ...$this->executiveRiskOverview($scorecards),
                'finance_risk' => (int) data_get($finance, 'finance_risk.score', 0),
                'logistics_risk' => (int) data_get($logistics, 'logistics_risk.score', 0),
            ];
            $healthScores = [
                ...$this->executiveHealthScores($scorecards),
                'finance_health' => $this->healthScoreFromNamedHealth(data_get($finance, 'finance_risk.health', 'healthy')),
                'payment_health' => $this->healthScoreFromNamedHealth(data_get($finance, 'payment_health.health', 'healthy')),
                'accounting_health' => $this->healthScoreFromNamedHealth(data_get($finance, 'accounting_health.health', 'healthy')),
                'logistics_health' => $this->healthScoreFromNamedHealth(data_get($logistics, 'logistics_risk.health', 'healthy')),
                'shipping_health' => $this->healthScoreFromNamedHealth(data_get($logistics, 'shipping_health.health', 'healthy')),
            ];
            $riskScore = (int) round(collect($scorecards)->avg('risk_score') ?? 0);

            return [
                'filters' => [
                    'from' => $from->toDateString(),
                    'to' => $to->toDateString(),
                    'company_id' => $companyId,
                    'plan' => $plan,
                    'health' => $health,
                ],
                'executive_summary' => [
                    'system_health' => $this->healthFromRisk($riskScore),
                    'executive_risk_score' => $riskScore,
                    'active_companies' => $saas['active_companies'],
                    'active_subscriptions' => $saas['active_subscriptions'],
                    'total_revenue' => $business['total_revenue'],
                    'order_count' => $business['order_count'],
                    'finance_risk_score' => (int) data_get($finance, 'finance_risk.score', 0),
                    'logistics_risk_score' => (int) data_get($logistics, 'logistics_risk.score', 0),
                ],
                'business_metrics' => $business,
                'saas_intelligence' => $saas,
                'finance_intelligence' => [
                    'payment_health' => $finance['payment_health'],
                    'accounting_health' => $finance['accounting_health'],
                    'finance_risk' => $finance['finance_risk'],
                    'refund_rate' => $finance['refunds']['refund_rate'],
                    'invoice_success_rate' => $finance['invoice_success']['invoice_success_rate'],
                ],
                'logistics_intelligence' => [
                    'shipping_health' => $logistics['shipping_health'],
                    'logistics_risk' => $logistics['logistics_risk'],
                    'delivery_success_rate' => $logistics['delivery_performance']['delivery_success_rate'],
                    'delayed_shipments' => $logistics['delivery_performance']['delayed_shipments'],
                ],
                'finance_health' => $finance['finance_risk']['health'] ?? 'healthy',
                'payment_health' => $finance['payment_health']['health'] ?? 'healthy',
                'accounting_health' => $finance['accounting_health']['health'] ?? 'healthy',
                'logistics_health' => $logistics['logistics_risk']['health'] ?? 'healthy',
                'shipping_health' => $logistics['shipping_health']['health'] ?? 'healthy',
                'finance_risk' => $finance['finance_risk'] ?? ['score' => 0, 'health' => 'healthy', 'factors' => []],
                'logistics_risk' => $logistics['logistics_risk'] ?? ['score' => 0, 'health' => 'healthy', 'factors' => []],
                'tenant_scorecards' => $scorecards,
                'risk_overview' => $riskOverview,
                'health_scores' => $healthScores,
                'top_risks' => $this->executiveTopRisks($scorecards),
                'growth_signals' => $this->executiveGrowthSignals($scorecards),
            ];
        });
    }

    private function executiveBusinessMetrics(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $orders = $this->ordersQuery($from, $to, $companyId, null);
        $orderCount = (clone $orders)->count();
        $totalRevenue = (float) (clone $orders)->sum('total_amount');

        return [
            'total_revenue' => round($totalRevenue, 2),
            'order_count' => $orderCount,
            'avg_order_value' => $orderCount > 0 ? round($totalRevenue / $orderCount, 2) : 0,
            'daily_revenue' => $this->dailySeries($from, $to, fn ($day) => (float) $this->ordersQuery($day->startOfDay(), $day->endOfDay(), $companyId, null)->sum('total_amount')),
            'daily_orders' => $this->dailySeries($from, $to, fn ($day) => $this->ordersQuery($day->startOfDay(), $day->endOfDay(), $companyId, null)->count()),
        ];
    }

    private function executiveSaasIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $companies = Company::query()
            ->when($companyId, fn ($query) => $query->where('id', $companyId))
            ->with(['subscriptions.plan', 'usageCounters'])
            ->get();
        $subscriptions = Subscription::query()
            ->with(['company:id,name', 'plan'])
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->get();
        $activeSubscriptions = $subscriptions->whereIn('status', ['active', 'trial']);
        $expiring = $activeSubscriptions->filter(fn (Subscription $subscription) => $this->subscriptionExpiresBetween($subscription, now(), now()->addDays(14)));
        $trial = $subscriptions->where('status', 'trial');
        $usageCounters = UsageCounter::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('limit', '>', 0)
            ->get();
        $riskCounters = $usageCounters->filter(fn (UsageCounter $counter) => $this->usageRate($counter) >= 90);
        $nearLimitCounters = $usageCounters->filter(fn (UsageCounter $counter) => $this->usageRate($counter) >= 75 && $this->usageRate($counter) < 90);
        $licenseRisk = $companies->filter(function (Company $company) use ($riskCounters, $expiring) {
            $latest = $this->latestSubscription($company);

            return ! $latest
                || ! in_array($latest->status, ['active', 'trial'], true)
                || $riskCounters->where('company_id', $company->id)->isNotEmpty()
                || $expiring->where('company_id', $company->id)->isNotEmpty();
        });

        return [
            'active_companies' => $companies->where('is_active', true)->count(),
            'active_subscriptions' => $activeSubscriptions->count(),
            'plan_distribution' => $activeSubscriptions
                ->groupBy(fn (Subscription $subscription) => $subscription->plan?->code ?: 'unassigned')
                ->map(fn ($rows, string $code) => [
                    'plan' => $code,
                    'label' => $rows->first()?->plan?->name ?: $code,
                    'count' => $rows->count(),
                ])
                ->values()
                ->all(),
            'subscription_health' => [
                'active' => $subscriptions->where('status', 'active')->count(),
                'trial' => $trial->count(),
                'cancelled' => $subscriptions->whereIn('status', ['cancelled', 'canceled'])->count(),
                'expired' => $subscriptions->where('status', 'expired')->count(),
                'expiring' => $expiring->count(),
            ],
            'usage_limit_summary' => [
                'tracked_counters' => $usageCounters->count(),
                'near_limit_counters' => $nearLimitCounters->count(),
                'limit_risk_counters' => $riskCounters->count(),
                'limit_risk_companies' => $riskCounters->pluck('company_id')->unique()->count(),
                'top_limit_risks' => $riskCounters
                    ->sortByDesc(fn (UsageCounter $counter) => $this->usageRate($counter))
                    ->take(20)
                    ->map(fn (UsageCounter $counter) => [
                        'company_id' => $counter->company_id,
                        'metric' => $counter->metric,
                        'used' => (int) $counter->used,
                        'limit' => (int) $counter->limit,
                        'usage_rate' => $this->usageRate($counter),
                    ])
                    ->values()
                    ->all(),
            ],
            'expiring_subscriptions' => $expiring
                ->take(20)
                ->map(fn (Subscription $subscription) => [
                    'company_id' => $subscription->company_id,
                    'company_name' => $subscription->company?->name,
                    'plan' => $subscription->plan?->code,
                    'status' => $subscription->status,
                    'ends_at' => $subscription->ends_at,
                    'trial_ends_at' => $subscription->trial_ends_at,
                ])
                ->values()
                ->all(),
            'trial_companies' => $trial
                ->take(20)
                ->map(fn (Subscription $subscription) => [
                    'company_id' => $subscription->company_id,
                    'company_name' => $subscription->company?->name,
                    'plan' => $subscription->plan?->code,
                    'trial_ends_at' => $subscription->trial_ends_at,
                ])
                ->values()
                ->all(),
            'license_risk' => [
                'risk_companies' => $licenseRisk->count(),
                'companies' => $licenseRisk
                    ->take(20)
                    ->map(function (Company $company) use ($riskCounters, $expiring) {
                        $latest = $this->latestSubscription($company);

                        return [
                            'company_id' => $company->id,
                            'company_name' => $company->name,
                            'plan' => $latest?->plan?->code,
                            'subscription_status' => $latest?->status ?: 'none',
                            'usage_rate' => $this->companyUsageRate($company),
                            'expiring' => $expiring->where('company_id', $company->id)->isNotEmpty(),
                            'limit_risk' => $riskCounters->where('company_id', $company->id)->isNotEmpty(),
                        ];
                    })
                    ->values()
                    ->all(),
            ],
        ];
    }

    private function tenantScorecards(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $plan, ?string $health): array
    {
        $companies = Company::query()
            ->when($companyId, fn ($query) => $query->where('id', $companyId))
            ->when($plan, fn ($query) => $query->whereHas('subscriptions.plan', fn ($subscriptionPlan) => $subscriptionPlan->where('code', $plan)))
            ->with(['subscriptions.plan', 'usageCounters'])
            ->get();

        return $companies
            ->map(fn (Company $company) => $this->tenantScorecard($company, $from, $to))
            ->when($health, fn ($rows) => $rows->where('health', $health))
            ->sortByDesc('risk_score')
            ->take(50)
            ->values()
            ->all();
    }

    private function tenantScorecard(Company $company, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $subscription = $this->latestSubscription($company);
        $revenue = (float) Order::query()->where('company_id', $company->id)->whereBetween('created_at', [$from, $to])->sum('total_amount');
        $orderVolume = Order::query()->where('company_id', $company->id)->whereBetween('created_at', [$from, $to])->count();
        $apiErrors = ApiLog::query()->where('company_id', $company->id)->whereBetween('created_at', [$from, $to])->where('status_code', '>=', 400)->count();
        $queueFailures = SyncRun::query()
            ->whereHas('marketplace', fn ($marketplace) => $marketplace->where('company_id', $company->id))
            ->whereBetween('created_at', [$from, $to])
            ->where('status', 'failed')
            ->count();
        $inboundWebhookFailures = InboundWebhookDelivery::query()
            ->where('company_id', $company->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['failed', 'invalid_signature', 'unknown_account'])
            ->count();
        $outboundWebhookFailures = WebhookDeliveryLog::query()
            ->where('company_id', $company->id)
            ->whereBetween('created_at', [$from, $to])
            ->where(function ($query) {
                $query->whereIn('status', ['failed', 'error'])->orWhereNotNull('failed_at');
            })
            ->count();
        $xmlFailedRuns = ProductImportRun::query()
            ->where('company_id', $company->id)
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['failed', 'cancelled'])
            ->count();
        $marketplaceFailedProducts = ProductMarketplaceStatus::query()
            ->whereHas('product', fn ($product) => $product->where('company_id', $company->id))
            ->whereBetween('updated_at', [$from, $to])
            ->whereIn('status', ['failed', 'problematic', 'blocked', 'rejected'])
            ->count();
        $marketplaceFailedAccounts = MarketplaceAccount::query()
            ->where('company_id', $company->id)
            ->where('connection_status', 'failed')
            ->count();
        $usageRate = $this->companyUsageRate($company);
        $risk = $this->tenantRiskScore([
            'subscription_status' => $subscription?->status,
            'expiring_subscription' => $subscription ? $this->subscriptionExpiresBetween($subscription, now(), now()->addDays(14)) : false,
            'usage_rate' => $usageRate,
            'api_errors' => $apiErrors,
            'queue_failures' => $queueFailures,
            'webhook_failures' => $inboundWebhookFailures + $outboundWebhookFailures,
            'xml_failed_runs' => $xmlFailedRuns,
            'marketplace_failed_products' => $marketplaceFailedProducts,
            'marketplace_failed_accounts' => $marketplaceFailedAccounts,
        ]);

        return [
            'company_id' => $company->id,
            'company_name' => $company->name,
            'plan' => $subscription?->plan?->code ?: 'unassigned',
            'plan_name' => $subscription?->plan?->name,
            'subscription_status' => $subscription?->status ?: 'none',
            'usage_rate' => $usageRate,
            'order_volume' => $orderVolume,
            'revenue' => round($revenue, 2),
            'api_errors' => $apiErrors,
            'queue_failures' => $queueFailures,
            'webhook_failures' => $inboundWebhookFailures + $outboundWebhookFailures,
            'xml_failed_runs' => $xmlFailedRuns,
            'marketplace_failed_products' => $marketplaceFailedProducts,
            'risk_score' => $risk['score'],
            'health' => $risk['health'],
            'top_reasons' => $risk['reasons'],
        ];
    }

    private function tenantRiskScore(array $signals): array
    {
        $score = 0;
        $reasons = [];

        if (! in_array($signals['subscription_status'] ?? null, ['active', 'trial'], true)) {
            $score += 25;
            $reasons[] = ['key' => 'subscription_inactive', 'label' => 'Aktif abonelik yok', 'value' => $signals['subscription_status'] ?? 'none'];
        } elseif ($signals['expiring_subscription'] ?? false) {
            $score += 12;
            $reasons[] = ['key' => 'subscription_expiring', 'label' => 'Abonelik yakinda bitiyor', 'value' => 1];
        }
        if (($signals['usage_rate'] ?? 0) >= 90) {
            $score += 20;
            $reasons[] = ['key' => 'usage_limit_risk', 'label' => 'Kullanim limiti riski', 'value' => $signals['usage_rate']];
        }
        if (($signals['marketplace_failed_accounts'] ?? 0) > 0) {
            $score += 20;
            $reasons[] = ['key' => 'marketplace_account_failed', 'label' => 'Pazaryeri hesabi hatali', 'value' => $signals['marketplace_failed_accounts']];
        }
        if (($signals['marketplace_failed_products'] ?? 0) > 0) {
            $score += 15;
            $reasons[] = ['key' => 'marketplace_failed_products', 'label' => 'Problemli pazaryeri urunleri', 'value' => $signals['marketplace_failed_products']];
        }
        if (($signals['queue_failures'] ?? 0) > 0) {
            $score += 12;
            $reasons[] = ['key' => 'queue_failures', 'label' => 'Queue hatalari', 'value' => $signals['queue_failures']];
        }
        if (($signals['api_errors'] ?? 0) > 0) {
            $score += 10;
            $reasons[] = ['key' => 'api_errors', 'label' => 'API hatalari', 'value' => $signals['api_errors']];
        }
        if (($signals['webhook_failures'] ?? 0) > 0) {
            $score += 8;
            $reasons[] = ['key' => 'webhook_failures', 'label' => 'Webhook hatalari', 'value' => $signals['webhook_failures']];
        }
        if (($signals['xml_failed_runs'] ?? 0) > 0) {
            $score += 10;
            $reasons[] = ['key' => 'xml_failed_runs', 'label' => 'XML import hatalari', 'value' => $signals['xml_failed_runs']];
        }

        $score = min(100, $score);

        return [
            'score' => $score,
            'health' => $this->healthFromRisk($score),
            'reasons' => array_slice($reasons, 0, 5),
        ];
    }

    private function executiveRiskOverview(array $scorecards): array
    {
        $rows = collect($scorecards);

        return [
            'critical_companies' => $rows->where('health', 'critical')->count(),
            'warning_companies' => $rows->where('health', 'warning')->count(),
            'marketplace_risk' => $rows->sum('marketplace_failed_products'),
            'xml_risk' => $rows->sum('xml_failed_runs'),
            'queue_risk' => $rows->sum('queue_failures'),
            'api_risk' => $rows->sum('api_errors'),
            'webhook_risk' => $rows->sum('webhook_failures'),
        ];
    }

    private function executiveHealthScores(array $scorecards): array
    {
        $rows = collect($scorecards);
        $total = max(1, $rows->count());

        return [
            'saas_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => ! in_array($row['subscription_status'], ['active', 'trial'], true) || (float) $row['usage_rate'] >= 90)->count(), $total),
            'marketplace_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => (int) $row['marketplace_failed_products'] > 0)->count(), $total),
            'xml_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => (int) $row['xml_failed_runs'] > 0)->count(), $total),
            'operations_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => (int) $row['queue_failures'] > 0)->count(), $total),
            'api_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => (int) $row['api_errors'] > 0)->count(), $total),
            'webhook_health' => $this->healthScoreFromRisk($rows->filter(fn (array $row) => (int) $row['webhook_failures'] > 0)->count(), $total),
        ];
    }

    private function executiveTopRisks(array $scorecards): array
    {
        return collect($scorecards)
            ->flatMap(fn (array $row) => collect($row['top_reasons'] ?? [])->map(fn (array $reason) => [
                'company_id' => $row['company_id'],
                'company_name' => $row['company_name'],
                'health' => $row['health'],
                'risk_score' => $row['risk_score'],
                'key' => $reason['key'],
                'label' => $reason['label'],
                'value' => $reason['value'],
                'target_path' => "/companies/{$row['company_id']}",
            ]))
            ->sortByDesc('risk_score')
            ->take(20)
            ->values()
            ->all();
    }

    private function executiveGrowthSignals(array $scorecards): array
    {
        $rows = collect($scorecards);

        return [
            'top_revenue_companies' => $rows
                ->sortByDesc('revenue')
                ->take(20)
                ->map(fn (array $row) => $this->growthSignalRow($row, 'revenue'))
                ->values()
                ->all(),
            'high_usage_companies' => $rows
                ->filter(fn (array $row) => (float) $row['usage_rate'] >= 75)
                ->sortByDesc('usage_rate')
                ->take(20)
                ->map(fn (array $row) => $this->growthSignalRow($row, 'usage_rate'))
                ->values()
                ->all(),
            'upgrade_candidates' => $rows
                ->filter(fn (array $row) => (float) $row['usage_rate'] >= 80 && in_array($row['subscription_status'], ['active', 'trial'], true))
                ->sortByDesc('usage_rate')
                ->take(20)
                ->map(fn (array $row) => $this->growthSignalRow($row, 'upgrade'))
                ->values()
                ->all(),
            'trial_to_paid_candidates' => $rows
                ->filter(fn (array $row) => $row['subscription_status'] === 'trial' && ((int) $row['order_volume'] > 0 || (float) $row['revenue'] > 0))
                ->sortByDesc('revenue')
                ->take(20)
                ->map(fn (array $row) => $this->growthSignalRow($row, 'trial_conversion'))
                ->values()
                ->all(),
            'churn_risk_companies' => $rows
                ->filter(fn (array $row) => $row['health'] === 'critical' || ! in_array($row['subscription_status'], ['active', 'trial'], true))
                ->sortByDesc('risk_score')
                ->take(20)
                ->map(fn (array $row) => $this->growthSignalRow($row, 'churn_risk'))
                ->values()
                ->all(),
        ];
    }

    private function growthSignalRow(array $row, string $signal): array
    {
        return [
            'company_id' => $row['company_id'],
            'company_name' => $row['company_name'],
            'plan' => $row['plan'],
            'subscription_status' => $row['subscription_status'],
            'health' => $row['health'],
            'risk_score' => $row['risk_score'],
            'usage_rate' => $row['usage_rate'],
            'order_volume' => $row['order_volume'],
            'revenue' => $row['revenue'],
            'signal' => $signal,
        ];
    }

    private function latestSubscription(Company $company): ?Subscription
    {
        return $company->subscriptions
            ->sortByDesc(fn (Subscription $subscription) => $subscription->starts_at?->timestamp ?? $subscription->created_at?->timestamp ?? 0)
            ->first();
    }

    private function subscriptionExpiresBetween(Subscription $subscription, \DateTimeInterface $from, \DateTimeInterface $to): bool
    {
        foreach ([$subscription->ends_at, $subscription->trial_ends_at] as $date) {
            if ($date && $date->between($from, $to)) {
                return true;
            }
        }

        return false;
    }

    private function companyUsageRate(Company $company): float
    {
        return round($company->usageCounters
            ->filter(fn (UsageCounter $counter) => (int) $counter->limit > 0)
            ->max(fn (UsageCounter $counter) => $this->usageRate($counter)) ?? 0, 2);
    }

    private function usageRate(UsageCounter $counter): float
    {
        return round(((int) $counter->used / max((int) $counter->limit, 1)) * 100, 2);
    }

    private function healthScoreFromRisk(int $riskCount, int $total): array
    {
        $riskRate = ($riskCount / max(1, $total)) * 100;
        $score = (int) max(0, round(100 - $riskRate));

        return [
            'score' => $score,
            'health' => $this->healthFromRisk(100 - $score),
            'risk_count' => $riskCount,
        ];
    }

    private function healthFromRisk(int|float $score): string
    {
        if ($score >= 60) {
            return 'critical';
        }

        if ($score >= 20) {
            return 'warning';
        }

        return 'healthy';
    }

    private function healthScoreFromNamedHealth(string $health): array
    {
        $score = match ($health) {
            'critical' => 35,
            'warning' => 70,
            default => 100,
        };

        return [
            'score' => $score,
            'health' => $health,
            'risk_count' => $health === 'healthy' ? 0 : 1,
        ];
    }

    private function financeIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $payments = $this->financePaymentQuery($from, $to, $companyId)->with(['order.company:id,name', 'account.provider:id,code,name'])->get();
        $paymentLogs = $this->paymentLogQuery($from, $to, $companyId)->get();
        $invoices = Invoice::query()
            ->with(['company:id,name', 'account.integration:id,code,name'])
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $accountingLogs = $this->accountingLogQuery($from, $to, $companyId)->get();
        $paymentHealth = $this->paymentHealth($payments, $paymentLogs);
        $accountingHealth = $this->accountingHealth($invoices, $accountingLogs);
        $refunds = $this->refundAnalytics($payments);
        $commissions = $this->commissionAnalytics($payments);
        $invoiceSuccess = $this->invoiceSuccessAnalytics($invoices);
        $accountingErrors = $this->accountingErrorAnalytics($accountingLogs);
        $risk = $this->financeRiskScore($paymentHealth, $accountingHealth, $refunds, $commissions, $invoiceSuccess, $accountingErrors);

        return [
            'payment_health' => $paymentHealth,
            'provider_performance' => $this->providerPerformance($payments, $paymentLogs),
            'refunds' => $refunds,
            'commissions' => $commissions,
            'accounting_health' => $accountingHealth,
            'invoice_success' => $invoiceSuccess,
            'accounting_errors' => $accountingErrors,
            'finance_risk' => $risk,
        ];
    }

    private function paymentHealth(\Illuminate\Support\Collection $payments, \Illuminate\Support\Collection $logs): array
    {
        $total = $payments->count();
        $failed = $payments->filter(fn (Payment $payment) => $this->isFailedPayment($payment))->count();
        $pending = $payments->filter(fn (Payment $payment) => $this->isPendingPayment($payment))->count();
        $errors = $logs->filter(fn (PaymentLog $log) => filled($log->error_message) || in_array($log->status, ['failed', 'error', 'rejected'], true))->count();
        $failedRate = $total > 0 ? round(($failed / $total) * 100, 2) : 0;
        $pendingRate = $total > 0 ? round(($pending / $total) * 100, 2) : 0;
        $health = $failedRate >= 10 || $errors > 0 && $failedRate >= 5 ? 'critical' : (($failedRate >= 3 || $pendingRate >= 20 || $errors > 0) ? 'warning' : 'healthy');

        return [
            'health' => $health,
            'total_payments' => $total,
            'successful' => $payments->filter(fn (Payment $payment) => $this->isSuccessfulPayment($payment))->count(),
            'failed' => $failed,
            'pending' => $pending,
            'failed_rate' => $failedRate,
            'pending_rate' => $pendingRate,
            'provider_errors' => $errors,
            'latest_failed' => $payments
                ->filter(fn (Payment $payment) => $this->isFailedPayment($payment))
                ->sortByDesc('updated_at')
                ->take(20)
                ->map(fn (Payment $payment) => $this->paymentRow($payment))
                ->values()
                ->all(),
        ];
    }

    private function providerPerformance(\Illuminate\Support\Collection $payments, \Illuminate\Support\Collection $logs): array
    {
        $providerNames = PaymentProvider::query()->pluck('name', 'code');

        return $payments
            ->groupBy('provider_code')
            ->map(function ($providerPayments, string $providerCode) use ($providerNames, $logs) {
                $total = $providerPayments->count();
                $successful = $providerPayments->filter(fn (Payment $payment) => $this->isSuccessfulPayment($payment))->count();
                $failed = $providerPayments->filter(fn (Payment $payment) => $this->isFailedPayment($payment))->count();
                $refunded = $providerPayments->filter(fn (Payment $payment) => $this->isRefundedPayment($payment))->count();
                $pending = $providerPayments->filter(fn (Payment $payment) => $this->isPendingPayment($payment))->count();
                $providerLogs = $logs->where('provider_code', $providerCode);

                return [
                    'provider_code' => $providerCode,
                    'provider_name' => $providerNames[$providerCode] ?? $providerCode,
                    'total_payments' => $total,
                    'successful' => $successful,
                    'failed' => $failed,
                    'refunded' => $refunded,
                    'pending' => $pending,
                    'total_amount' => round((float) $providerPayments->sum('amount'), 2),
                    'refunded_amount' => round((float) $providerPayments->sum('refunded_amount'), 2),
                    'commission_amount' => round((float) $providerPayments->sum('commission_amount'), 2),
                    'success_rate' => $total > 0 ? round(($successful / $total) * 100, 2) : 0,
                    'refund_rate' => $total > 0 ? round(($refunded / $total) * 100, 2) : 0,
                    'failure_rate' => $total > 0 ? round(($failed / $total) * 100, 2) : 0,
                    'latest_error' => $providerLogs->filter(fn (PaymentLog $log) => filled($log->error_message))->sortByDesc('created_at')->first()?->error_message
                        ?: $providerPayments->filter(fn (Payment $payment) => filled($payment->error_message))->sortByDesc('updated_at')->first()?->error_message,
                ];
            })
            ->sortByDesc(fn (array $row) => $row['failed'] + $row['pending'])
            ->values()
            ->all();
    }

    private function refundAnalytics(\Illuminate\Support\Collection $payments): array
    {
        $refunds = $payments->filter(fn (Payment $payment) => $this->isRefundedPayment($payment));
        $total = $payments->count();

        return [
            'total_refunds' => $refunds->count(),
            'refunded_amount' => round((float) $payments->sum('refunded_amount'), 2),
            'refund_rate' => $total > 0 ? round(($refunds->count() / $total) * 100, 2) : 0,
            'refund_by_provider' => $refunds->countBy('provider_code')->map(fn (int $count, string $provider) => ['provider_code' => $provider, 'count' => $count])->values()->all(),
            'refund_by_company' => $refunds
                ->groupBy(fn (Payment $payment) => $payment->order?->company_id ?: 0)
                ->map(fn ($rows, int|string $companyId) => [
                    'company_id' => (int) $companyId,
                    'company_name' => $rows->first()?->order?->company?->name,
                    'count' => $rows->count(),
                    'refunded_amount' => round((float) $rows->sum('refunded_amount'), 2),
                ])
                ->sortByDesc('refunded_amount')
                ->take(20)
                ->values()
                ->all(),
            'latest_refunds' => $refunds
                ->sortByDesc('updated_at')
                ->take(20)
                ->map(fn (Payment $payment) => $this->paymentRow($payment))
                ->values()
                ->all(),
        ];
    }

    private function commissionAnalytics(\Illuminate\Support\Collection $payments): array
    {
        $totalRevenue = (float) $payments->sum('amount');
        $totalCommission = (float) $payments->sum('commission_amount');
        $rates = $payments->pluck('commission_rate')->filter(fn ($rate) => (float) $rate > 0)->map(fn ($rate) => (float) $rate)->values();

        return [
            'total_commission_amount' => round($totalCommission, 2),
            'avg_commission_rate' => $rates->count() > 0 ? round($rates->avg(), 2) : 0,
            'commission_by_provider' => $payments
                ->groupBy('provider_code')
                ->map(fn ($rows, string $provider) => [
                    'provider_code' => $provider,
                    'commission_amount' => round((float) $rows->sum('commission_amount'), 2),
                    'avg_commission_rate' => $rows->count() > 0 ? round((float) $rows->avg('commission_rate'), 2) : 0,
                ])
                ->sortByDesc('commission_amount')
                ->values()
                ->all(),
            'commission_to_revenue_ratio' => $totalRevenue > 0 ? round(($totalCommission / $totalRevenue) * 100, 2) : 0,
        ];
    }

    private function accountingHealth(\Illuminate\Support\Collection $invoices, \Illuminate\Support\Collection $logs): array
    {
        $total = $invoices->count();
        $failed = $invoices->whereIn('status', ['failed', 'error', 'rejected'])->count();
        $queued = $invoices->whereIn('status', ['queued', 'pending', 'processing'])->count();
        $errors = $logs->filter(fn (AccountingLog $log) => filled($log->error_message) || in_array($log->status, ['failed', 'error', 'rejected'], true))->count();
        $failedRate = $total > 0 ? round(($failed / $total) * 100, 2) : 0;
        $health = $failedRate >= 10 || $errors >= 3 ? 'critical' : (($failedRate > 0 || $queued > 0 || $errors > 0) ? 'warning' : 'healthy');

        return [
            'health' => $health,
            'total_invoices' => $total,
            'failed_invoices' => $failed,
            'queued_invoices' => $queued,
            'accounting_errors' => $errors,
            'failed_rate' => $failedRate,
        ];
    }

    private function invoiceSuccessAnalytics(\Illuminate\Support\Collection $invoices): array
    {
        $issued = $invoices->whereIn('status', ['issued', 'completed', 'success'])->count();
        $failed = $invoices->whereIn('status', ['failed', 'error', 'rejected'])->count();
        $queued = $invoices->whereIn('status', ['queued', 'pending', 'processing'])->count();
        $returns = $invoices->filter(fn (Invoice $invoice) => $invoice->type === 'return' || (float) $invoice->grand_total < 0)->count();

        return [
            'total_invoices' => $invoices->count(),
            'issued' => $issued,
            'failed' => $failed,
            'queued' => $queued,
            'return_invoices' => $returns,
            'invoice_success_rate' => $invoices->count() > 0 ? round(($issued / $invoices->count()) * 100, 2) : 0,
        ];
    }

    private function accountingErrorAnalytics(\Illuminate\Support\Collection $logs): array
    {
        $errors = $logs->filter(fn (AccountingLog $log) => filled($log->error_message) || in_array($log->status, ['failed', 'error', 'rejected'], true));

        return [
            'total_errors' => $errors->count(),
            'top_errors' => $errors
                ->pluck('error_message')
                ->filter()
                ->countBy()
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $message) => ['message' => $message, 'count' => $count])
                ->values()
                ->all(),
            'latest_errors' => $errors
                ->sortByDesc('created_at')
                ->take(20)
                ->map(fn (AccountingLog $log) => [
                    'id' => $log->id,
                    'invoice_id' => $log->invoice_id,
                    'provider_code' => $log->provider_code,
                    'event' => $log->event,
                    'status' => $log->status,
                    'error_message' => $log->error_message,
                    'duration_ms' => $log->duration_ms,
                    'created_at' => $log->created_at,
                ])
                ->values()
                ->all(),
        ];
    }

    private function financeRiskScore(array $paymentHealth, array $accountingHealth, array $refunds, array $commissions, array $invoiceSuccess, array $accountingErrors): array
    {
        $score = 0;
        $factors = [];

        $this->addRiskFactor($score, $factors, 'payment_failed_rate', 'Payment failed rate high', $paymentHealth['failed_rate'] ?? 0, ($paymentHealth['failed_rate'] ?? 0) >= 10 ? 25 : (($paymentHealth['failed_rate'] ?? 0) >= 3 ? 12 : 0));
        $this->addRiskFactor($score, $factors, 'payment_provider_errors', 'Payment provider errors', $paymentHealth['provider_errors'] ?? 0, ($paymentHealth['provider_errors'] ?? 0) > 0 ? 15 : 0);
        $this->addRiskFactor($score, $factors, 'refund_rate', 'Refund rate high', $refunds['refund_rate'] ?? 0, ($refunds['refund_rate'] ?? 0) >= 10 ? 15 : 0);
        $this->addRiskFactor($score, $factors, 'commission_ratio', 'Commission ratio high', $commissions['commission_to_revenue_ratio'] ?? 0, ($commissions['commission_to_revenue_ratio'] ?? 0) >= 8 ? 10 : 0);
        $this->addRiskFactor($score, $factors, 'invoice_failed_rate', 'Invoice failed rate high', $accountingHealth['failed_rate'] ?? 0, ($accountingHealth['failed_rate'] ?? 0) >= 10 ? 20 : (($invoiceSuccess['failed'] ?? 0) > 0 ? 10 : 0));
        $this->addRiskFactor($score, $factors, 'accounting_errors', 'ERP/accounting errors', $accountingErrors['total_errors'] ?? 0, ($accountingErrors['total_errors'] ?? 0) > 0 ? 20 : 0);

        return [
            'score' => min(100, $score),
            'health' => $this->healthFromRisk($score),
            'factors' => $factors,
        ];
    }

    private function logisticsIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $shipments = $this->shipmentAnalyticsQuery($from, $to, $companyId)->with(['order.company:id,name', 'account.carrier:id,code,name'])->get();
        $shippingHealth = $this->shippingHealth($shipments, $companyId);
        $delivery = $this->deliveryPerformance($shipments);
        $failed = $this->failedShipmentAnalytics($shipments);
        $risk = $this->logisticsRiskScore($shippingHealth, $delivery, $failed, $shipments, $companyId);

        return [
            'shipping_health' => $shippingHealth,
            'carrier_performance' => $this->carrierPerformance($shipments, $companyId),
            'delivery_performance' => $delivery,
            'failed_shipments' => $failed,
            'logistics_risk' => $risk,
        ];
    }

    private function shippingHealth(\Illuminate\Support\Collection $shipments, ?int $companyId): array
    {
        $total = $shipments->count();
        $failed = $shipments->filter(fn (Shipment $shipment) => $this->isFailedShipment($shipment))->count();
        $pending = $shipments->whereIn('status', ['queued', 'pending', 'processing'])->count();
        $delayed = $this->delayedShipments($shipments)->count();
        $carrierErrors = ShippingAccount::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where(function ($query) {
                $query->where('last_status', 'failed')->orWhereNotNull('last_error');
            })
            ->count();
        $failedRate = $total > 0 ? round(($failed / $total) * 100, 2) : 0;
        $health = $failedRate >= 10 || $carrierErrors > 0 ? 'critical' : (($failed > 0 || $pending > 0 || $delayed > 0) ? 'warning' : 'healthy');

        return [
            'health' => $health,
            'total_shipments' => $total,
            'failed_shipments' => $failed,
            'pending_shipments' => $pending,
            'delayed_shipments' => $delayed,
            'carrier_errors' => $carrierErrors,
            'failed_rate' => $failedRate,
        ];
    }

    private function carrierPerformance(\Illuminate\Support\Collection $shipments, ?int $companyId): array
    {
        $carrierNames = ShippingCarrier::query()->pluck('name', 'code');
        $carrierErrors = ShippingAccount::query()
            ->with('carrier:id,code,name')
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where(function ($query) {
                $query->where('last_status', 'failed')->orWhereNotNull('last_error');
            })
            ->get()
            ->groupBy(fn (ShippingAccount $account) => $account->carrier?->code ?: $account->name);

        return $shipments
            ->groupBy('carrier_code')
            ->map(function ($carrierShipments, string $carrierCode) use ($carrierNames, $carrierErrors) {
                $total = $carrierShipments->count();
                $delivered = $carrierShipments->where('status', 'delivered')->count();
                $failed = $carrierShipments->filter(fn (Shipment $shipment) => $this->isFailedShipment($shipment))->count();
                $deliveryHours = $carrierShipments
                    ->filter(fn (Shipment $shipment) => $shipment->shipped_at && $shipment->delivered_at)
                    ->map(fn (Shipment $shipment) => round($shipment->shipped_at->diffInMinutes($shipment->delivered_at) / 60, 2));

                return [
                    'carrier_code' => $carrierCode,
                    'carrier_name' => $carrierNames[$carrierCode] ?? $carrierCode,
                    'total_shipments' => $total,
                    'delivered' => $delivered,
                    'shipped' => $carrierShipments->whereIn('status', ['shipped', 'in_transit'])->count(),
                    'failed' => $failed,
                    'returned' => $carrierShipments->filter(fn (Shipment $shipment) => filled($shipment->return_code) || in_array($shipment->status, ['returned', 'return_created'], true))->count(),
                    'delivery_success_rate' => $total > 0 ? round(($delivered / $total) * 100, 2) : 0,
                    'failure_rate' => $total > 0 ? round(($failed / $total) * 100, 2) : 0,
                    'avg_delivery_hours' => $deliveryHours->count() > 0 ? round($deliveryHours->avg(), 2) : 0,
                    'latest_error' => $carrierErrors->get($carrierCode)?->sortByDesc('last_checked_at')->first()?->last_error
                        ?: $carrierShipments->filter(fn (Shipment $shipment) => filled($shipment->error_message))->sortByDesc('updated_at')->first()?->error_message,
                ];
            })
            ->sortByDesc(fn (array $row) => $row['failed'] + $row['returned'])
            ->values()
            ->all();
    }

    private function deliveryPerformance(\Illuminate\Support\Collection $shipments): array
    {
        $delivered = $shipments->where('status', 'delivered');
        $deliveryHours = $delivered
            ->filter(fn (Shipment $shipment) => $shipment->shipped_at && $shipment->delivered_at)
            ->map(fn (Shipment $shipment) => round($shipment->shipped_at->diffInMinutes($shipment->delivered_at) / 60, 2));
        $total = $shipments->count();

        return [
            'avg_delivery_time_hours' => $deliveryHours->count() > 0 ? round($deliveryHours->avg(), 2) : 0,
            'delivered_count' => $delivered->count(),
            'in_transit_count' => $shipments->whereIn('status', ['shipped', 'in_transit'])->count(),
            'delayed_shipments' => $this->delayedShipments($shipments)->count(),
            'delayed_samples' => $this->delayedShipments($shipments)
                ->sortByDesc('shipped_at')
                ->take(20)
                ->map(fn (Shipment $shipment) => $this->shipmentRow($shipment))
                ->values()
                ->all(),
            'delivery_success_rate' => $total > 0 ? round(($delivered->count() / $total) * 100, 2) : 0,
        ];
    }

    private function failedShipmentAnalytics(\Illuminate\Support\Collection $shipments): array
    {
        $failed = $shipments->filter(fn (Shipment $shipment) => $this->isFailedShipment($shipment));
        $total = $shipments->count();

        return [
            'failed_count' => $failed->count(),
            'failed_rate' => $total > 0 ? round(($failed->count() / $total) * 100, 2) : 0,
            'top_errors' => $failed
                ->pluck('error_message')
                ->filter()
                ->countBy()
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $message) => ['message' => $message, 'count' => $count])
                ->values()
                ->all(),
            'latest_failed' => $failed
                ->sortByDesc('updated_at')
                ->take(20)
                ->map(fn (Shipment $shipment) => $this->shipmentRow($shipment))
                ->values()
                ->all(),
        ];
    }

    private function logisticsRiskScore(array $shippingHealth, array $delivery, array $failed, \Illuminate\Support\Collection $shipments, ?int $companyId): array
    {
        $score = 0;
        $factors = [];
        $carrierErrors = (int) ($shippingHealth['carrier_errors'] ?? 0);
        $returns = $shipments->filter(fn (Shipment $shipment) => filled($shipment->return_code) || in_array($shipment->status, ['returned', 'return_created'], true))->count();
        $pending = (int) ($shippingHealth['pending_shipments'] ?? 0);

        $this->addRiskFactor($score, $factors, 'failed_shipments', 'Failed shipment rate high', $failed['failed_rate'] ?? 0, ($failed['failed_rate'] ?? 0) >= 10 ? 25 : (($failed['failed_count'] ?? 0) > 0 ? 12 : 0));
        $this->addRiskFactor($score, $factors, 'carrier_error', 'Carrier account errors', $carrierErrors, $carrierErrors > 0 ? 25 : 0);
        $this->addRiskFactor($score, $factors, 'delayed_shipments', 'Delayed shipments', $delivery['delayed_shipments'] ?? 0, ($delivery['delayed_shipments'] ?? 0) > 0 ? 20 : 0);
        $this->addRiskFactor($score, $factors, 'return_volume', 'Return volume high', $returns, $returns > 0 ? 10 : 0);
        $this->addRiskFactor($score, $factors, 'pending_backlog', 'Pending shipment backlog', $pending, $pending >= 10 ? 10 : 0);

        return [
            'score' => min(100, $score),
            'health' => $this->healthFromRisk($score),
            'factors' => $factors,
        ];
    }

    private function addRiskFactor(int &$score, array &$factors, string $key, string $label, int|float $value, int $weight): void
    {
        if ($weight <= 0) {
            return;
        }

        $score += $weight;
        $factors[] = ['key' => $key, 'label' => $label, 'value' => $value, 'weight' => $weight];
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

    private function marketplaceIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $marketplaces = $marketplaceCode ? [$marketplaceCode] : ['trendyol', 'hepsiburada'];
        $rows = collect($marketplaces)
            ->mapWithKeys(fn (string $marketplace) => [$marketplace => $this->marketplacePerformance($from, $to, $companyId, $marketplace)])
            ->all();

        return [
            'health_summary' => [
                'healthy' => collect($rows)->where('health', 'healthy')->count(),
                'warning' => collect($rows)->where('health', 'warning')->count(),
                'critical' => collect($rows)->where('health', 'critical')->count(),
            ],
            'marketplaces' => $rows,
            'batch_success' => $this->batchSuccessAnalytics($from, $to, $companyId, $marketplaceCode),
            'rejected_products' => $this->productStatusAnalytics($from, $to, $companyId, $marketplaceCode, ['rejected']),
            'failed_products' => $this->productStatusAnalytics($from, $to, $companyId, $marketplaceCode, ['failed', 'problematic', 'blocked']),
            'variant_problems' => $this->variantProblemAnalytics($companyId, $marketplaceCode),
        ];
    }

    private function marketplacePerformance(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, string $marketplace): array
    {
        $accounts = MarketplaceAccount::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('code', $marketplace)
            ->get();
        $statuses = ProductMarketplaceStatus::query()
            ->where('marketplace_code', $marketplace)
            ->when($companyId, fn ($query) => $query->whereHas('product', fn ($product) => $product->where('company_id', $companyId)))
            ->whereBetween('updated_at', [$from, $to])
            ->get();
        $api = $this->apiErrorIntelligence($from, $to, $companyId, $marketplace);
        $ready = $statuses->where('readiness_status', 'ready')->count();
        $notReady = $statuses->where('readiness_status', 'not_ready')->count();
        $approved = $statuses->where('status', 'approved')->count();
        $failed = $statuses->whereIn('status', ['failed', 'problematic', 'blocked'])->count();
        $rejected = $statuses->where('status', 'rejected')->count();
        $totalTerminal = $approved + $failed + $rejected;
        $failedAccounts = $accounts->where('connection_status', 'failed')->count();
        $health = $this->marketplaceHealth($failedAccounts, $api, $failed + $rejected, $statuses->whereIn('status', ['queued', 'sent'])->count());

        return [
            'health' => $health,
            'active_accounts' => $accounts->where('is_active', true)->count(),
            'failed_accounts' => $failedAccounts,
            'approved' => $approved,
            'queued' => $statuses->where('status', 'queued')->count(),
            'sent' => $statuses->where('status', 'sent')->count(),
            'failed' => $statuses->where('status', 'failed')->count(),
            'rejected' => $rejected,
            'problematic' => $statuses->where('status', 'problematic')->count(),
            'blocked' => $statuses->where('status', 'blocked')->count(),
            'ready' => $ready,
            'not_ready' => $notReady,
            'readiness_rate' => ($ready + $notReady) > 0 ? round(($ready / ($ready + $notReady)) * 100, 2) : 0,
            'success_rate' => $totalTerminal > 0 ? round(($approved / $totalTerminal) * 100, 2) : 0,
            'api_errors' => $api['api_errors'],
            'slow_requests' => $api['slow_requests'],
            'last_product_sync_at' => $accounts->max('last_product_sync_at'),
            'last_price_sync_at' => $accounts->max('last_price_sync_at'),
            'last_order_sync_at' => $accounts->max('last_order_sync_at'),
            'last_error' => $accounts->pluck('last_error')->filter()->first(),
        ];
    }

    private function marketplaceHealth(int $failedAccounts, array $api, int $problemProducts, int $queuedProducts): string
    {
        $hasServerError = ($api['status_5xx'] ?? 0) > 0 || $this->apiServerErrors($api) > 0;

        if ($failedAccounts > 0 || $hasServerError) {
            return 'critical';
        }

        if ($problemProducts > 0 || $queuedProducts > 0 || ($api['slow_requests'] ?? 0) > 0 || ($api['api_errors'] ?? 0) > 0) {
            return 'warning';
        }

        return 'healthy';
    }

    private function apiServerErrors(array $api): int
    {
        return (int) collect($api['top_status_codes'] ?? [])->filter(fn (array $row) => (int) $row['status_code'] >= 500)->sum('count');
    }

    private function batchSuccessAnalytics(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $statuses = $this->marketplaceStatusQuery($from, $to, $companyId, $marketplaceCode)->get();
        $withBatch = $statuses->filter(fn (ProductMarketplaceStatus $status) => filled($status->batch_request_id));
        $approved = $withBatch->where('status', 'approved')->count();
        $queued = $withBatch->whereIn('status', ['queued', 'sent'])->count();
        $failed = $withBatch->whereIn('status', ['failed', 'problematic', 'blocked'])->count();
        $rejected = $withBatch->where('status', 'rejected')->count();
        $latestBatch = $withBatch->sortByDesc(fn (ProductMarketplaceStatus $status) => $this->statusTimestamp($status))->first();

        return [
            'total_batch_products' => $statuses->count(),
            'products_with_batch' => $withBatch->count(),
            'approved_products' => $approved,
            'queued_products' => $queued,
            'failed_products' => $failed,
            'rejected_products' => $rejected,
            'latest_batch_request_id' => $latestBatch?->batch_request_id,
            'latest_sent_at' => $withBatch->filter(fn ($status) => filled($status->last_sent_at))->sortByDesc(fn ($status) => $this->statusTimestamp($status))->first()?->last_sent_at,
            'latest_checked_at' => $withBatch->filter(fn ($status) => filled($status->last_checked_at))->sortByDesc(fn ($status) => $this->statusTimestamp($status))->first()?->last_checked_at,
            'batch_success_rate' => $withBatch->count() > 0 ? round(($approved / $withBatch->count()) * 100, 2) : 0,
            'problem_batches' => $withBatch
                ->filter(fn (ProductMarketplaceStatus $status) => in_array($status->status, ['failed', 'rejected', 'problematic', 'blocked'], true))
                ->groupBy(fn (ProductMarketplaceStatus $status) => $status->marketplace_code.'|'.$status->batch_request_id)
                ->map(function ($group, string $key) {
                    [$marketplace, $batchId] = explode('|', $key, 2);

                    return [
                        'marketplace_code' => $marketplace,
                        'batch_request_id' => $batchId,
                        'problem_count' => $group->count(),
                        'failed_count' => $group->whereIn('status', ['failed', 'problematic', 'blocked'])->count(),
                        'rejected_count' => $group->where('status', 'rejected')->count(),
                    ];
                })
                ->sortByDesc('problem_count')
                ->take(20)
                ->values()
                ->all(),
        ];
    }

    private function productStatusAnalytics(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode, array $statuses): array
    {
        $all = $this->marketplaceStatusQuery($from, $to, $companyId, $marketplaceCode)->get();
        $problem = $all->filter(fn (ProductMarketplaceStatus $status) => in_array($status->status, $statuses, true));

        return [
            'total' => $problem->count(),
            'rate' => $all->count() > 0 ? round(($problem->count() / $all->count()) * 100, 2) : 0,
            'by_marketplace' => $problem->countBy('marketplace_code')->all(),
            'top_error_messages' => $problem
                ->pluck('error_message')
                ->filter()
                ->countBy()
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $message) => ['message' => $message, 'count' => $count])
                ->values()
                ->all(),
            'latest' => $problem
                ->sortByDesc(fn (ProductMarketplaceStatus $status) => $this->statusTimestamp($status))
                ->take(20)
                ->map(fn (ProductMarketplaceStatus $status) => $this->marketplaceStatusRow($status))
                ->values()
                ->all(),
        ];
    }

    private function variantProblemAnalytics(?int $companyId, ?string $marketplaceCode): array
    {
        $parents = Product::query()
            ->where('product_type', 'parent')
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->with(['variants.marketplaceStatuses'])
            ->limit(200)
            ->get();
        $rollup = new ProductVariantRollupService();
        $problemParents = [];
        $problemChildren = [];
        $parentsWithProblems = 0;
        $problemChildrenCount = 0;

        foreach ($parents as $parent) {
            $statuses = collect($rollup->marketplaceStatuses($parent));
            if ($marketplaceCode) {
                $statuses = $statuses->only([$marketplaceCode]);
            }

            $children = $statuses->flatMap(fn (array $status) => $status['problem_children'] ?? [])->values();
            if ($children->isEmpty()) {
                continue;
            }

            $parentsWithProblems++;
            $problemChildrenCount += $children->count();

            if (count($problemParents) < 50) {
                $problemParents[] = [
                    'product_id' => $parent->id,
                    'sku' => $parent->sku,
                    'name' => $parent->name,
                    'variant_group_key' => $parent->variant_group_key,
                    'problem_children' => $children->count(),
                ];
            }

            foreach ($children as $child) {
                if (count($problemChildren) >= 100) {
                    break 2;
                }
                $problemChildren[] = $child;
            }
        }

        return [
            'parents_with_problem_children' => $parentsWithProblems,
            'problem_children_count' => $problemChildrenCount,
            'latest_problem_children' => $problemChildren,
            'problem_parents' => $problemParents,
        ];
    }

    private function operationsIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $queue = $this->queueIntelligence($from, $to, $companyId);
        $api = $this->apiErrorIntelligence($from, $to, $companyId, $marketplaceCode);
        $webhooks = $this->webhookReliability($from, $to, $companyId, $marketplaceCode);
        $marketplace = $this->marketplaceIntelligence($from, $to, $companyId, $marketplaceCode);
        $risk = $this->operationalRiskScore($marketplace, $queue, $api, $webhooks);

        return [
            'queue' => $queue,
            'api' => $api,
            'webhooks' => $webhooks,
            'risk_score' => $risk,
            'alerts' => $this->operationsAlerts($marketplace, $queue, $api, $webhooks, $risk),
        ];
    }

    private function queueIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): array
    {
        $syncRuns = SyncRun::query()
            ->with('marketplace:id,company_id,code,name')
            ->when($companyId, fn ($query) => $query->whereHas('marketplace.company', fn ($company) => $company->where('id', $companyId)))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $globalPending = $companyId ? 0 : DB::table('jobs')->count();
        $globalFailed = $companyId ? 0 : DB::table('failed_jobs')->count();
        $failedSyncRuns = $syncRuns->where('status', 'failed');

        return [
            'pending_jobs' => $syncRuns->whereIn('status', ['queued', 'pending'])->count() + $globalPending,
            'running_jobs' => $syncRuns->where('status', 'running')->count(),
            'failed_jobs' => $failedSyncRuns->count() + $globalFailed,
            'completed_sync_runs' => $syncRuns->where('status', 'completed')->count(),
            'failed_sync_runs' => $failedSyncRuns->count(),
            'retry_jobs' => $syncRuns->filter(fn (SyncRun $run) => (int) $run->attempts > 0)->count(),
            'failed_by_type' => $failedSyncRuns->countBy('type')->all(),
            'recent_failed_sync_runs' => $failedSyncRuns
                ->sortByDesc('created_at')
                ->take(20)
                ->map(fn (SyncRun $run) => [
                    'id' => $run->id,
                    'type' => $run->type,
                    'marketplace_code' => $run->marketplace?->code,
                    'status' => $run->status,
                    'attempts' => $run->attempts,
                    'error_message' => $run->error_message,
                    'created_at' => $run->created_at,
                ])
                ->values()
                ->all(),
            'queue_risk' => ($failedSyncRuns->count() + $globalFailed) > 0 ? 'critical' : ($syncRuns->whereIn('status', ['queued', 'pending', 'running'])->count() + $globalPending > 0 ? 'warning' : 'healthy'),
        ];
    }

    private function apiErrorIntelligence(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $logs = ApiLog::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $errors = $logs->filter(fn (ApiLog $log) => (int) $log->status_code >= 400);
        $slow = $logs->filter(fn (ApiLog $log) => (int) $log->duration_ms >= 1000);

        return [
            'total_requests' => $logs->count(),
            'api_errors' => $errors->count(),
            'error_rate' => $logs->count() > 0 ? round(($errors->count() / $logs->count()) * 100, 2) : 0,
            'slow_requests' => $slow->count(),
            'avg_duration_ms' => $logs->count() > 0 ? (int) round($logs->avg('duration_ms')) : 0,
            'status_4xx' => $logs->filter(fn (ApiLog $log) => (int) $log->status_code >= 400 && (int) $log->status_code < 500)->count(),
            'status_5xx' => $logs->filter(fn (ApiLog $log) => (int) $log->status_code >= 500)->count(),
            'top_status_codes' => $errors
                ->countBy(fn (ApiLog $log) => (string) $log->status_code)
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $status) => ['status_code' => (int) $status, 'count' => $count])
                ->values()
                ->all(),
            'top_error_endpoints' => $errors
                ->countBy('endpoint')
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $endpoint) => ['endpoint' => $endpoint, 'count' => $count])
                ->values()
                ->all(),
            'top_marketplace_errors' => $errors
                ->countBy(fn (ApiLog $log) => (string) ($log->marketplace_code ?: 'platform'))
                ->sortDesc()
                ->take(10)
                ->map(fn (int $count, string $marketplace) => ['marketplace_code' => $marketplace, 'count' => $count])
                ->values()
                ->all(),
            'latest_errors' => $errors
                ->sortByDesc('created_at')
                ->take(20)
                ->map(fn (ApiLog $log) => [
                    'id' => $log->id,
                    'marketplace_code' => $log->marketplace_code,
                    'method' => $log->method,
                    'endpoint' => $log->endpoint,
                    'status_code' => $log->status_code,
                    'duration_ms' => $log->duration_ms,
                    'error_message' => $log->error_message,
                    'created_at' => $log->created_at,
                ])
                ->values()
                ->all(),
        ];
    }

    private function webhookReliability(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): array
    {
        $inbound = InboundWebhookDelivery::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $outbound = WebhookDeliveryLog::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->whereBetween('created_at', [$from, $to])
            ->get();
        $inboundSuccess = $inbound->where('status', 'processed')->count();
        $outboundSuccess = $outbound->where('success', true)->count();
        $outboundFailed = $outbound->filter(fn (WebhookDeliveryLog $log) => in_array($log->status, ['failed', 'error'], true) || filled($log->failed_at))->count();

        return [
            'inbound_total' => $inbound->count(),
            'inbound_success' => $inboundSuccess,
            'inbound_failed' => $inbound->where('status', 'failed')->count(),
            'inbound_invalid_signature' => $inbound->filter(fn (InboundWebhookDelivery $delivery) => $delivery->status === 'invalid_signature' || $delivery->signature_valid === false)->count(),
            'inbound_unknown_account' => $inbound->where('status', 'unknown_account')->count(),
            'inbound_success_rate' => $inbound->count() > 0 ? round(($inboundSuccess / $inbound->count()) * 100, 2) : 0,
            'outbound_total' => $outbound->count(),
            'outbound_success' => $outboundSuccess,
            'outbound_failed' => $outboundFailed,
            'outbound_success_rate' => $outbound->count() > 0 ? round(($outboundSuccess / $outbound->count()) * 100, 2) : 0,
            'latest_failed_webhooks' => $inbound
                ->filter(fn (InboundWebhookDelivery $delivery) => in_array($delivery->status, ['failed', 'invalid_signature', 'unknown_account'], true))
                ->sortByDesc('created_at')
                ->take(20)
                ->map(fn (InboundWebhookDelivery $delivery) => [
                    'id' => $delivery->id,
                    'direction' => 'inbound',
                    'marketplace_code' => $delivery->marketplace_code,
                    'event' => $delivery->event,
                    'status' => $delivery->status,
                    'error_message' => $delivery->last_error,
                    'created_at' => $delivery->created_at,
                ])
                ->concat($outbound
                    ->filter(fn (WebhookDeliveryLog $log) => in_array($log->status, ['failed', 'error'], true) || filled($log->failed_at))
                    ->sortByDesc('created_at')
                    ->take(20)
                    ->map(fn (WebhookDeliveryLog $log) => [
                        'id' => $log->id,
                        'direction' => 'outbound',
                        'marketplace_code' => null,
                        'event' => $log->event,
                        'status' => $log->status,
                        'error_message' => $log->last_error,
                        'created_at' => $log->created_at,
                    ]))
                ->sortByDesc('created_at')
                ->take(20)
                ->values()
                ->all(),
        ];
    }

    private function operationalRiskScore(array $marketplace, array $queue, array $api, array $webhooks): array
    {
        $factors = [];
        $score = 0;
        $failedAccounts = collect($marketplace['marketplaces'] ?? [])->sum('failed_accounts');
        $statusTotal = collect($marketplace['marketplaces'] ?? [])->sum(fn (array $row) => ($row['approved'] ?? 0) + ($row['failed'] ?? 0) + ($row['rejected'] ?? 0) + ($row['problematic'] ?? 0) + ($row['blocked'] ?? 0));
        $problemProducts = collect($marketplace['marketplaces'] ?? [])->sum(fn (array $row) => ($row['failed'] ?? 0) + ($row['rejected'] ?? 0) + ($row['problematic'] ?? 0) + ($row['blocked'] ?? 0));
        $problemRate = $statusTotal > 0 ? ($problemProducts / $statusTotal) * 100 : 0;

        if ($failedAccounts > 0) {
            $score += 25;
            $factors[] = ['key' => 'failed_marketplace_account', 'label' => 'Failed marketplace account', 'value' => $failedAccounts, 'weight' => 25];
        }
        if ($problemRate >= 10) {
            $score += 20;
            $factors[] = ['key' => 'product_problem_rate', 'label' => 'Failed/rejected product rate high', 'value' => round($problemRate, 2), 'weight' => 20];
        }
        if (($api['error_rate'] ?? 0) >= 10 || ($api['status_5xx'] ?? 0) > 0) {
            $score += 20;
            $factors[] = ['key' => 'api_error_rate', 'label' => 'Provider API error risk', 'value' => $api['error_rate'] ?? 0, 'weight' => 20];
        }
        if (($queue['failed_jobs'] ?? 0) > 0) {
            $score += 15;
            $factors[] = ['key' => 'queue_failed_jobs', 'label' => 'Failed queue jobs', 'value' => $queue['failed_jobs'], 'weight' => 15];
        }
        $webhookTotal = ($webhooks['inbound_total'] ?? 0) + ($webhooks['outbound_total'] ?? 0);
        $webhookFailed = ($webhooks['inbound_failed'] ?? 0) + ($webhooks['inbound_invalid_signature'] ?? 0) + ($webhooks['inbound_unknown_account'] ?? 0) + ($webhooks['outbound_failed'] ?? 0);
        if ($webhookTotal > 0 && (($webhookFailed / $webhookTotal) * 100) >= 10) {
            $score += 10;
            $factors[] = ['key' => 'webhook_failed_rate', 'label' => 'Webhook failed rate high', 'value' => round(($webhookFailed / $webhookTotal) * 100, 2), 'weight' => 10];
        }
        $staleSyncs = collect($marketplace['marketplaces'] ?? [])->filter(fn (array $row) => blank($row['last_product_sync_at']) && blank($row['last_order_sync_at']))->count();
        if ($staleSyncs > 0) {
            $score += 10;
            $factors[] = ['key' => 'stale_marketplace_sync', 'label' => 'Stale marketplace sync', 'value' => $staleSyncs, 'weight' => 10];
        }

        return [
            'score' => min(100, $score),
            'health' => $score >= 60 ? 'critical' : ($score >= 20 ? 'warning' : 'healthy'),
            'factors' => $factors,
        ];
    }

    private function operationsAlerts(array $marketplace, array $queue, array $api, array $webhooks, array $risk): array
    {
        $alerts = [];

        foreach (($marketplace['marketplaces'] ?? []) as $code => $row) {
            $target = "/marketplaces/{$code}";
            $this->pushAlert($alerts, 'marketplace_account_failed', 'Marketplace account failed', $row['failed_accounts'] ?? 0, 'critical', $code, 'Baglanti bilgilerini ve son hatayi kontrol edin.', $target);
            $this->pushAlert($alerts, 'rejected_products', 'Rejected products', $row['rejected'] ?? 0, 'warning', $code, 'Reddedilen urunlerin kategori, marka ve zorunlu ozelliklerini kontrol edin.', '/products');
            $this->pushAlert($alerts, 'failed_products', 'Failed products', ($row['failed'] ?? 0) + ($row['problematic'] ?? 0) + ($row['blocked'] ?? 0), 'critical', $code, 'Provider hata mesajlarini ve urun readiness detaylarini inceleyin.', '/products');
            $this->pushAlert($alerts, 'slow_provider_api', 'Slow provider API', $row['slow_requests'] ?? 0, 'warning', $code, 'Yavas provider endpointlerini API loglarinda inceleyin.', '/api-logs');
        }

        $this->pushAlert($alerts, 'provider_api_errors', 'Provider API errors', $api['api_errors'] ?? 0, ($api['status_5xx'] ?? 0) > 0 ? 'critical' : 'warning', null, 'API loglarinda hata endpointlerini kontrol edin.', '/api-logs');
        $this->pushAlert($alerts, 'failed_batch_products', 'Failed batch products', ($marketplace['batch_success']['failed_products'] ?? 0) + ($marketplace['batch_success']['rejected_products'] ?? 0), 'critical', null, 'Batch problem gruplarini ve urun detaylarini kontrol edin.', '/products');
        $this->pushAlert($alerts, 'variant_problem_children', 'Variant problem children', $marketplace['variant_problems']['problem_children_count'] ?? 0, 'warning', null, 'Problemli child varyantlari parent detayindan cozumleyin.', '/products');
        $this->pushAlert($alerts, 'queue_failed_jobs', 'Queue failed jobs', $queue['failed_jobs'] ?? 0, 'critical', null, 'Failed queue joblarini retry merkezinde inceleyin.', '/queue');
        $this->pushAlert($alerts, 'webhook_failed', 'Webhook failed', ($webhooks['inbound_failed'] ?? 0) + ($webhooks['outbound_failed'] ?? 0), 'warning', null, 'Webhook teslimat detaylarini kontrol edin.', '/api-logs');
        $this->pushAlert($alerts, 'webhook_invalid_signature', 'Webhook invalid signature', $webhooks['inbound_invalid_signature'] ?? 0, 'critical', null, 'Webhook secret ve imza ayarlarini kontrol edin.', '/api-logs');
        $this->pushAlert($alerts, 'stale_marketplace_sync', 'Stale marketplace sync', collect($risk['factors'] ?? [])->firstWhere('key', 'stale_marketplace_sync')['value'] ?? 0, 'warning', null, 'Pazaryeri senkron zamanlarini kontrol edin.', '/marketplaces');

        return collect($alerts)->take(30)->values()->all();
    }

    private function pushAlert(array &$alerts, string $key, string $label, int|float $value, string $tone, ?string $marketplaceCode, string $actionHint, string $targetPath): void
    {
        if ((float) $value <= 0) {
            return;
        }

        $alerts[] = [
            'key' => $key,
            'label' => $label,
            'value' => $value,
            'tone' => $tone,
            'marketplace_code' => $marketplaceCode,
            'action_hint' => $actionHint,
            'target_path' => $targetPath,
        ];
    }

    private function marketplaceStatusQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, ?string $marketplaceCode): Builder
    {
        return ProductMarketplaceStatus::query()
            ->with('product:id,company_id,parent_product_id,sku,barcode,name,variant_group_key')
            ->when($marketplaceCode, fn ($query) => $query->where('marketplace_code', $marketplaceCode))
            ->when($companyId, fn ($query) => $query->whereHas('product', fn ($product) => $product->where('company_id', $companyId)))
            ->whereBetween('updated_at', [$from, $to]);
    }

    private function marketplaceStatusRow(ProductMarketplaceStatus $status): array
    {
        return [
            'product_id' => $status->product_id,
            'sku' => $status->product?->sku,
            'barcode' => $status->product?->barcode,
            'name' => $status->product?->name,
            'marketplace_code' => $status->marketplace_code,
            'status' => $status->status,
            'error_message' => $status->error_message,
            'batch_request_id' => $status->batch_request_id,
            'last_checked_at' => $status->last_checked_at,
        ];
    }

    private function marketplaceProductStatusRows(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, string $marketplaceCode, array $statuses, int $limit): array
    {
        return $this->marketplaceStatusQuery($from, $to, $companyId, $marketplaceCode)
            ->get()
            ->filter(fn (ProductMarketplaceStatus $status) => in_array($status->status, $statuses, true))
            ->sortByDesc(fn (ProductMarketplaceStatus $status) => $this->statusTimestamp($status))
            ->take($limit)
            ->map(fn (ProductMarketplaceStatus $status) => $this->marketplaceStatusRow($status))
            ->values()
            ->all();
    }

    private function queueFailures(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, string $marketplaceCode, int $limit): array
    {
        return SyncRun::query()
            ->with('marketplace:id,company_id,code,name')
            ->where('status', 'failed')
            ->whereHas('marketplace', fn ($marketplace) => $marketplace
                ->where('code', $marketplaceCode)
                ->when($companyId, fn ($query) => $query->where('company_id', $companyId)))
            ->whereBetween('created_at', [$from, $to])
            ->latest()
            ->limit($limit)
            ->get()
            ->map(fn (SyncRun $run) => [
                'id' => $run->id,
                'type' => $run->type,
                'marketplace_code' => $run->marketplace?->code,
                'status' => $run->status,
                'attempts' => $run->attempts,
                'error_message' => $run->error_message,
                'created_at' => $run->created_at,
                'target_path' => '/queue',
            ])
            ->values()
            ->all();
    }

    private function webhookFailures(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, string $marketplaceCode, int $limit): array
    {
        return InboundWebhookDelivery::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('marketplace_code', $marketplaceCode)
            ->whereBetween('created_at', [$from, $to])
            ->whereIn('status', ['failed', 'invalid_signature', 'unknown_account'])
            ->latest()
            ->limit($limit)
            ->get()
            ->map(fn (InboundWebhookDelivery $delivery) => [
                'id' => $delivery->id,
                'direction' => 'inbound',
                'marketplace_code' => $delivery->marketplace_code,
                'event' => $delivery->event,
                'status' => $delivery->status,
                'error_message' => $delivery->last_error,
                'created_at' => $delivery->created_at,
                'target_path' => '/api-logs',
            ])
            ->values()
            ->all();
    }

    private function apiErrorRows(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId, string $marketplaceCode, int $limit): array
    {
        return ApiLog::query()
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('marketplace_code', $marketplaceCode)
            ->whereBetween('created_at', [$from, $to])
            ->where('status_code', '>=', 400)
            ->latest()
            ->limit($limit)
            ->get()
            ->map(fn (ApiLog $log) => [
                'id' => $log->id,
                'marketplace_code' => $log->marketplace_code,
                'method' => $log->method,
                'endpoint' => $log->endpoint,
                'status_code' => $log->status_code,
                'duration_ms' => $log->duration_ms,
                'error_message' => $log->error_message,
                'created_at' => $log->created_at,
                'target_path' => '/api-logs?search='.urlencode((string) $log->endpoint),
            ])
            ->values()
            ->all();
    }

    private function staleSync(string $marketplaceCode, ?int $companyId): array
    {
        $accounts = MarketplaceAccount::query()
            ->where('code', $marketplaceCode)
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->get();
        $lastProductSync = $accounts->max('last_product_sync_at');
        $lastOrderSync = $accounts->max('last_order_sync_at');
        $threshold = now()->subDays(2);
        $lastProductSyncDate = $lastProductSync ? CarbonImmutable::parse($lastProductSync) : null;
        $lastOrderSyncDate = $lastOrderSync ? CarbonImmutable::parse($lastOrderSync) : null;
        $isStale = $accounts->isNotEmpty() && (
            $lastProductSyncDate === null
            || $lastOrderSyncDate === null
            || $lastProductSyncDate->lt($threshold)
            || $lastOrderSyncDate->lt($threshold)
        );

        return [
            'is_stale' => $isStale,
            'last_product_sync_at' => $lastProductSync,
            'last_order_sync_at' => $lastOrderSync,
            'threshold' => $threshold,
            'reason' => $isStale ? 'Son pazaryeri senkronu beklenen araligin disinda.' : null,
        ];
    }

    private function buildMarketplaceIncidents(
        string $marketplaceCode,
        array $marketplace,
        array $summary,
        array $batch,
        array $api,
        array $queue,
        array $webhooks,
        array $variantProblems,
        array $staleSync
    ): array {
        $incidents = [];
        $label = $this->marketplaceLabel($marketplaceCode);

        $this->pushIncident($incidents, 'marketplace_account_failed', 'critical', 'Marketplace account failed', "{$label} hesap baglantisi basarisiz.", $marketplace['failed_accounts'] ?? 0, 'Credential, yetki veya provider hesap durumunda sorun olabilir.', 'Pazaryeri ayarlarini ve son hata mesajini kontrol edin.', "/marketplaces/{$marketplaceCode}");
        $rejectedSeverity = ($summary['rejected_products'] ?? 0) >= 10 || ($marketplace['success_rate'] ?? 100) < 80 ? 'critical' : 'warning';
        $this->pushIncident($incidents, 'rejected_products', $rejectedSeverity, 'Rejected products', "{$label} tarafinda reddedilen urunler var.", $summary['rejected_products'] ?? 0, 'Kategori, barkod, marka veya zorunlu attribute eksigi olabilir.', 'Rejected urunleri urun detayinda ve API loglarinda inceleyin.', '/products');
        $this->pushIncident($incidents, 'failed_products', 'warning', 'Failed products', "{$label} gonderiminde failed/problematic urunler var.", $summary['failed_products'] ?? 0, 'Provider hata mesaji veya readiness eksigi urun gonderimini bloke ediyor olabilir.', 'Failed urunleri duzenleyin ve publish queue durumunu kontrol edin.', '/products/publish-queue');
        $this->pushIncident($incidents, 'failed_batch', 'critical', 'Failed batch', "{$label} batch gruplarinda basarisiz urunler var.", $summary['failed_batches'] ?? 0, 'Batch icindeki urunlerden biri veya daha fazlasi provider tarafindan kabul edilmedi.', 'Batch ID ile API loglarini ve publish queue kayitlarini inceleyin.', '/products/publish-queue');
        $this->pushIncident($incidents, 'api_errors', ($api['status_5xx'] ?? 0) > 0 ? 'critical' : 'warning', 'API errors', "{$label} API hatalari kaydedildi.", $api['api_errors'] ?? 0, (($api['status_5xx'] ?? 0) > 0 ? 'Provider veya servis tarafinda 5xx hata var.' : 'Provider 4xx/validasyon hatalari donuyor olabilir.'), 'API Logs ekraninda endpoint ve payload detayini inceleyin.', '/api-logs');
        $this->pushIncident($incidents, 'slow_api', 'warning', 'Slow API', "{$label} API isteklerinde yavaslik var.", $api['slow_requests'] ?? 0, 'Provider yanit suresi veya ag gecikmesi operasyonu yavaslatiyor olabilir.', 'Yavas endpointleri API Logs uzerinden kontrol edin.', '/api-logs');
        $this->pushIncident($incidents, 'queue_failed', 'critical', 'Queue failed', "{$label} queue isleri basarisiz oldu.", count($queue), 'Senkron veya publish joblari hata ile tamamlandi.', 'Queue Retry Merkezi uzerinden job detayini inceleyin.', '/queue');
        $this->pushIncident($incidents, 'webhook_failed', 'warning', 'Webhook failed', "{$label} webhook teslimat sorunlari var.", count($webhooks), 'Inbound webhook imzasi, hesap eslesmesi veya payload isleme hatasi olabilir.', 'Webhook kayitlarini Hata Merkezi uzerinden inceleyin.', '/api-logs');
        $this->pushIncident($incidents, 'stale_sync', 'warning', 'Stale sync', "{$label} senkron bilgisi eski.", $staleSync['is_stale'] ? 1 : 0, $staleSync['reason'] ?? 'Senkron zamani kontrol edilmeli.', 'Pazaryeri yonetim ekranindan son senkron zamanlarini kontrol edin.', "/marketplaces/{$marketplaceCode}");
        $this->pushIncident($incidents, 'variant_problem', 'warning', 'Variant problem', "{$label} varyant child urunlerinde problem var.", $variantProblems['problem_children_count'] ?? 0, 'Parent altindaki child varyantlardan bazilari provider status veya readiness problemi tasiyor.', 'Problemli varyantlari urun detayindan cozumleyin.', '/products');

        return collect($incidents)
            ->sortBy(fn (array $incident) => ['critical' => 0, 'warning' => 1, 'info' => 2][$incident['severity']] ?? 3)
            ->take(30)
            ->values()
            ->all();
    }

    private function pushIncident(array &$incidents, string $key, string $severity, string $title, string $summary, int|float $value, string $rootCause, string $actionHint, string $targetPath): void
    {
        if ((float) $value <= 0) {
            return;
        }

        $incidents[] = [
            'key' => $key,
            'type' => $key,
            'severity' => $severity,
            'title' => $title,
            'summary' => $summary,
            'value' => $value,
            'root_cause' => $rootCause,
            'action_hint' => $actionHint,
            'target_path' => $targetPath,
        ];
    }

    private function marketplaceActionLinks(string $marketplaceCode): array
    {
        return [
            ['label' => 'API Logs', 'target' => '/api-logs'],
            ['label' => 'Queue', 'target' => '/queue'],
            ['label' => 'Publish Queue', 'target' => '/products/publish-queue'],
            ['label' => 'Products', 'target' => '/products'],
            ['label' => "{$this->marketplaceLabel($marketplaceCode)} Settings", 'target' => "/marketplaces/{$marketplaceCode}"],
        ];
    }

    private function marketplaceLabel(string $marketplaceCode): string
    {
        return [
            'trendyol' => 'Trendyol',
            'hepsiburada' => 'Hepsiburada',
        ][$marketplaceCode] ?? ucfirst($marketplaceCode);
    }

    private function statusTimestamp(ProductMarketplaceStatus $status): int
    {
        foreach ([$status->last_checked_at, $status->last_sent_at, $status->updated_at, $status->created_at] as $date) {
            if (! $date) {
                continue;
            }

            return $date instanceof \DateTimeInterface ? $date->getTimestamp() : (strtotime((string) $date) ?: 0);
        }

        return 0;
    }

    private function financePaymentQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): Builder
    {
        return Payment::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId, fn ($query) => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)));
    }

    private function paymentLogQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): Builder
    {
        return PaymentLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId, function ($query) use ($companyId) {
                $query->where(function ($scope) use ($companyId) {
                    $scope->whereHas('payment.order', fn ($order) => $order->where('company_id', $companyId))
                        ->orWhereIn('payment_account_id', PaymentAccount::query()->where('company_id', $companyId)->select('id'));
                });
            });
    }

    private function accountingLogQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): Builder
    {
        return AccountingLog::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId, function ($query) use ($companyId) {
                $query->where(function ($scope) use ($companyId) {
                    $scope->whereIn('invoice_id', Invoice::query()->where('company_id', $companyId)->select('id'))
                        ->orWhereIn('accounting_account_id', AccountingAccount::query()->where('company_id', $companyId)->select('id'));
                });
            });
    }

    private function shipmentAnalyticsQuery(CarbonImmutable $from, CarbonImmutable $to, ?int $companyId): Builder
    {
        return Shipment::query()
            ->whereBetween('created_at', [$from, $to])
            ->when($companyId, fn ($query) => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)));
    }

    private function isSuccessfulPayment(Payment $payment): bool
    {
        return in_array($payment->status, ['paid', 'completed', 'success'], true);
    }

    private function isFailedPayment(Payment $payment): bool
    {
        return in_array($payment->status, ['failed', 'cancelled', 'canceled', 'rejected', 'error'], true) || filled($payment->error_message);
    }

    private function isPendingPayment(Payment $payment): bool
    {
        return in_array($payment->status, ['pending', 'created', 'processing', 'three_d'], true);
    }

    private function isRefundedPayment(Payment $payment): bool
    {
        return in_array($payment->status, ['refunded', 'partially_refunded', 'partial_refund'], true) || (float) $payment->refunded_amount > 0;
    }

    private function paymentRow(Payment $payment): array
    {
        return [
            'payment_id' => $payment->id,
            'order_id' => $payment->order_id,
            'company_id' => $payment->order?->company_id,
            'company_name' => $payment->order?->company?->name,
            'provider_code' => $payment->provider_code,
            'status' => $payment->status,
            'amount' => (float) $payment->amount,
            'refunded_amount' => (float) $payment->refunded_amount,
            'error_message' => $payment->error_message,
            'created_at' => $payment->created_at,
            'updated_at' => $payment->updated_at,
        ];
    }

    private function isFailedShipment(Shipment $shipment): bool
    {
        return in_array($shipment->status, ['failed', 'cancelled', 'canceled', 'problematic', 'error'], true) || filled($shipment->error_message);
    }

    private function delayedShipments(\Illuminate\Support\Collection $shipments): \Illuminate\Support\Collection
    {
        return $shipments->filter(fn (Shipment $shipment) => $shipment->shipped_at
            && ! $shipment->delivered_at
            && ! $this->isFailedShipment($shipment)
            && $shipment->shipped_at->lt(now()->subDays(3)));
    }

    private function shipmentRow(Shipment $shipment): array
    {
        return [
            'shipment_id' => $shipment->id,
            'order_id' => $shipment->order_id,
            'company_id' => $shipment->order?->company_id,
            'company_name' => $shipment->order?->company?->name,
            'carrier_code' => $shipment->carrier_code,
            'status' => $shipment->status,
            'tracking_number' => $shipment->tracking_number,
            'last_action' => $shipment->last_action,
            'error_message' => $shipment->error_message,
            'shipped_at' => $shipment->shipped_at,
            'delivered_at' => $shipment->delivered_at,
            'updated_at' => $shipment->updated_at,
        ];
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
