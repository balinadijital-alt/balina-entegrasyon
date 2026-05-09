<?php

namespace App\Services\Shipping\Providers;

class TrendyolExpressCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'trendyol_express';
    }
}
