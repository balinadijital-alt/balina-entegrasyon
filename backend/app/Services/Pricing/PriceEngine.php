<?php

namespace App\Services\Pricing;

class PriceEngine
{
    public function calculate(array $payload): array
    {
        $base = (float) ($payload['base_cost'] ?? 0);
        $commission = (float) ($payload['commission_cost'] ?? 0);
        $tax = (float) ($payload['tax_cost'] ?? 0);
        $shipping = (float) ($payload['shipping_cost'] ?? 0);
        $packaging = (float) ($payload['packaging_cost'] ?? 0);
        $ad = (float) ($payload['ad_cost'] ?? 0);
        $minimumProfit = (float) ($payload['minimum_profit_amount'] ?? 0);
        $profitRate = (float) ($payload['profit_rate'] ?? 0);
        $profit = max($minimumProfit, $base * ($profitRate / 100));
        $sale = $base + $commission + $tax + $shipping + $packaging + $ad + $profit;

        return [
            'profit_amount' => round($profit, 2),
            'sale_price' => round($sale, 2),
            'payload' => $payload,
        ];
    }
}
