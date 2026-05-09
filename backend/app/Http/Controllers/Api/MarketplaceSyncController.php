<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\MarketplaceServiceFactory;
use Illuminate\Http\JsonResponse;

class MarketplaceSyncController extends Controller
{
    public function syncProducts(MarketplaceAccount $marketplace, MarketplaceServiceFactory $factory): JsonResponse
    {
        return response()->json($factory->make($marketplace)->syncProducts($marketplace));
    }

    public function syncOrders(MarketplaceAccount $marketplace, MarketplaceServiceFactory $factory): JsonResponse
    {
        return response()->json($factory->make($marketplace)->syncOrders($marketplace));
    }
}
