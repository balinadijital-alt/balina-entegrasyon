<?php

namespace App\Services\Marketplaces;

use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\Contracts\MarketplaceService;
use InvalidArgumentException;

class MarketplaceServiceFactory
{
    public function make(MarketplaceAccount $account): MarketplaceService
    {
        return match ($account->code) {
            'trendyol' => app(TrendyolService::class),
            'hepsiburada' => app(HepsiburadaService::class),
            default => throw new InvalidArgumentException("Desteklenmeyen pazaryeri: {$account->code}"),
        };
    }
}
