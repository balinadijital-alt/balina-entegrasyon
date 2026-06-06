<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Services\Audit\AuditLogger;
use App\Services\Marketplaces\MarketplaceServiceFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketplaceSyncController extends Controller
{
    public function syncProducts(MarketplaceAccount $marketplace, MarketplaceServiceFactory $factory, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $audit->logAction($request, 'marketplace', 'products.sync', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
        ]);

        return response()->json($factory->make($marketplace)->syncProducts($marketplace));
    }

    public function syncOrders(MarketplaceAccount $marketplace, MarketplaceServiceFactory $factory, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $audit->logAction($request, 'marketplace', 'orders.sync', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
        ]);

        return response()->json($factory->make($marketplace)->syncOrders($marketplace));
    }
}
