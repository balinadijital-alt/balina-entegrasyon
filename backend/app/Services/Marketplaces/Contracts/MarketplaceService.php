<?php

namespace App\Services\Marketplaces\Contracts;

use App\Models\MarketplaceAccount;

interface MarketplaceService
{
    public function syncProducts(MarketplaceAccount $account): array;

    public function syncOrders(MarketplaceAccount $account): array;
}
