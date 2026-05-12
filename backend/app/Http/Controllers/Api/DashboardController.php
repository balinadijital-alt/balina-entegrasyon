<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiLog;
use App\Models\Company;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\Product;
use App\Models\Shipment;
use App\Models\Subscription;
use App\Models\UsageCounter;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $today = CarbonImmutable::today();
        $previousStart = $today->subDays(13);
        $currentStart = $today->subDays(6);

        $companyId = $this->tenantCompanyId(request());

        return response()->json([
            'summary' => [
                $this->metric('Toplam Satis', (float) $this->query(Order::class, $companyId)->sum('total_amount'), 'TRY', $this->percentageChange(
                    $this->query(Order::class, $companyId)->whereDate('created_at', '>=', $currentStart)->sum('total_amount'),
                    $this->query(Order::class, $companyId)->whereBetween('created_at', [$previousStart, $currentStart->subSecond()])->sum('total_amount')
                )),
                $this->metric('Siparis', $this->query(Order::class, $companyId)->count(), '', $this->percentageChange(
                    $this->query(Order::class, $companyId)->whereDate('created_at', '>=', $currentStart)->count(),
                    $this->query(Order::class, $companyId)->whereBetween('created_at', [$previousStart, $currentStart->subSecond()])->count()
                )),
                $this->metric('Aktif Urun', $this->query(Product::class, $companyId)->where('status', 'active')->count(), '', null),
                $this->metric('Kargo', $this->query(Shipment::class, $companyId)->count(), '', null),
                $this->metric('Basarili Odeme', $this->query(Payment::class, $companyId)->where('status', 'paid')->count(), '', null),
                $this->metric('Kesilen Fatura', $this->query(Invoice::class, $companyId)->whereIn('status', ['issued', 'sent', 'completed'])->count(), '', null),
                $this->metric('Aktif Abonelik', $this->query(Subscription::class, $companyId)->whereIn('status', ['active', 'trial'])->count(), '', null),
                $this->metric('API Cagrisi', $this->query(ApiLog::class, $companyId)->count(), '', null),
            ],
            'charts' => [
                'sales' => $this->dailySeries($currentStart, fn ($day) => (float) $this->query(Order::class, $companyId)->whereDate('created_at', $day)->sum('total_amount')),
                'orders' => $this->dailySeries($currentStart, fn ($day) => $this->query(Order::class, $companyId)->whereDate('created_at', $day)->count()),
            ],
            'breakdowns' => [
                'orders' => $this->countByStatus(Order::class, $companyId),
                'products' => $this->countByStatus(Product::class, $companyId),
                'shipping' => $this->countByStatus(Shipment::class, $companyId),
                'payments' => $this->countByStatus(Payment::class, $companyId),
                'invoices' => $this->countByStatus(Invoice::class, $companyId),
            ],
            'saas_usage' => $this->saasUsage($companyId),
            'recent_activity' => [
                'orders' => $this->query(Order::class, $companyId)->with('company:id,name')->latest()->limit(5)->get(['id', 'company_id', 'marketplace_order_id', 'customer_name', 'total_amount', 'status', 'created_at']),
                'payments' => $this->query(Payment::class, $companyId)->with('order:id,marketplace_order_id')->latest()->limit(5)->get(['id', 'order_id', 'provider_code', 'status', 'amount', 'created_at']),
                'shipments' => $this->query(Shipment::class, $companyId)->with('order:id,marketplace_order_id')->latest()->limit(5)->get(['id', 'order_id', 'carrier_code', 'status', 'tracking_number', 'created_at']),
                'logs' => $this->query(ApiLog::class, $companyId)->latest()->limit(5)->get(['id', 'marketplace_code', 'method', 'endpoint', 'status_code', 'duration_ms', 'created_at']),
            ],
            'empty_states' => [
                'has_demo_data' => $this->query(Company::class, $companyId)->where('tax_number', 'DEMO0000000')->exists(),
                'company_count' => $this->query(Company::class, $companyId)->count(),
                'product_count' => $this->query(Product::class, $companyId)->count(),
                'order_count' => $this->query(Order::class, $companyId)->count(),
            ],
        ]);
    }

    private function metric(string $label, int|float $value, string $prefix = '', ?float $change = null): array
    {
        return compact('label', 'value', 'prefix', 'change');
    }

    private function percentageChange(int|float $current, int|float $previous): ?float
    {
        if ((float) $previous === 0.0) {
            return (float) $current === 0.0 ? 0 : 100;
        }

        return round((($current - $previous) / $previous) * 100, 1);
    }

    private function dailySeries(CarbonImmutable $start, callable $resolver): array
    {
        return collect(range(0, 6))->map(function (int $offset) use ($start, $resolver) {
            $day = $start->addDays($offset);

            return [
                'label' => $day->format('d.m'),
                'value' => $resolver($day->toDateString()),
            ];
        })->values()->all();
    }

    private function countByStatus(string $model, ?int $companyId): array
    {
        return $this->query($model, $companyId)
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => ['label' => $row->status ?: 'unknown', 'value' => (int) $row->total])
            ->values()
            ->all();
    }

    private function saasUsage(?int $companyId): array
    {
        return $this->query(UsageCounter::class, $companyId)
            ->select('metric', DB::raw('sum(used) as used'), DB::raw('sum(`limit`) as limit_total'))
            ->groupBy('metric')
            ->get()
            ->map(fn ($row) => [
                'metric' => $row->metric,
                'used' => (int) $row->used,
                'limit' => (int) $row->limit_total,
                'percentage' => (int) $row->limit_total > 0 ? min(100, round(((int) $row->used / (int) $row->limit_total) * 100)) : null,
            ])
            ->values()
            ->all();
    }

    private function query(string $model, ?int $companyId): Builder
    {
        $query = $model::query();

        if (! $companyId) {
            return $query;
        }

        return match ($model) {
            Company::class => $query->where('id', $companyId),
            Payment::class, Shipment::class => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)),
            default => $query->where('company_id', $companyId),
        };
    }
}
