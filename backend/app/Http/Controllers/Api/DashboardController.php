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
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $today = CarbonImmutable::today();
        $previousStart = $today->subDays(13);
        $currentStart = $today->subDays(6);

        return response()->json([
            'summary' => [
                $this->metric('Toplam Satis', (float) Order::sum('total_amount'), 'TRY', $this->percentageChange(
                    Order::whereDate('created_at', '>=', $currentStart)->sum('total_amount'),
                    Order::whereBetween('created_at', [$previousStart, $currentStart->subSecond()])->sum('total_amount')
                )),
                $this->metric('Siparis', Order::count(), '', $this->percentageChange(
                    Order::whereDate('created_at', '>=', $currentStart)->count(),
                    Order::whereBetween('created_at', [$previousStart, $currentStart->subSecond()])->count()
                )),
                $this->metric('Aktif Urun', Product::where('status', 'active')->count(), '', null),
                $this->metric('Kargo', Shipment::count(), '', null),
                $this->metric('Basarili Odeme', Payment::where('status', 'paid')->count(), '', null),
                $this->metric('Kesilen Fatura', Invoice::whereIn('status', ['issued', 'sent', 'completed'])->count(), '', null),
                $this->metric('Aktif Abonelik', Subscription::whereIn('status', ['active', 'trial'])->count(), '', null),
                $this->metric('API Cagrisi', ApiLog::count(), '', null),
            ],
            'charts' => [
                'sales' => $this->dailySeries($currentStart, fn ($day) => (float) Order::whereDate('created_at', $day)->sum('total_amount')),
                'orders' => $this->dailySeries($currentStart, fn ($day) => Order::whereDate('created_at', $day)->count()),
            ],
            'breakdowns' => [
                'orders' => $this->countByStatus(Order::class),
                'products' => $this->countByStatus(Product::class),
                'shipping' => $this->countByStatus(Shipment::class),
                'payments' => $this->countByStatus(Payment::class),
                'invoices' => $this->countByStatus(Invoice::class),
            ],
            'saas_usage' => $this->saasUsage(),
            'recent_activity' => [
                'orders' => Order::with('company:id,name')->latest()->limit(5)->get(['id', 'company_id', 'marketplace_order_id', 'customer_name', 'total_amount', 'status', 'created_at']),
                'payments' => Payment::with('order:id,marketplace_order_id')->latest()->limit(5)->get(['id', 'order_id', 'provider_code', 'status', 'amount', 'created_at']),
                'shipments' => Shipment::with('order:id,marketplace_order_id')->latest()->limit(5)->get(['id', 'order_id', 'carrier_code', 'status', 'tracking_number', 'created_at']),
                'logs' => ApiLog::latest()->limit(5)->get(['id', 'marketplace_code', 'method', 'endpoint', 'status_code', 'duration_ms', 'created_at']),
            ],
            'empty_states' => [
                'has_demo_data' => Company::where('tax_number', 'DEMO0000000')->exists(),
                'company_count' => Company::count(),
                'product_count' => Product::count(),
                'order_count' => Order::count(),
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

    private function countByStatus(string $model): array
    {
        return $model::query()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => ['label' => $row->status ?: 'unknown', 'value' => (int) $row->total])
            ->values()
            ->all();
    }

    private function saasUsage(): array
    {
        return UsageCounter::query()
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
}
