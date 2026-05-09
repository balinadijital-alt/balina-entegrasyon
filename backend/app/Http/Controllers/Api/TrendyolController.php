<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\MarketplaceApiException;
use App\Http\Controllers\Controller;
use App\Jobs\Trendyol\PullTrendyolOrdersJob;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use App\Jobs\Trendyol\UpdateTrendyolPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\TrendyolService;
use Illuminate\Http\JsonResponse;

class TrendyolController extends Controller
{
    public function test(MarketplaceAccount $marketplace, TrendyolService $service): JsonResponse
    {
        return $this->respond(fn () => $service->testConnection($marketplace));
    }

    public function categories(MarketplaceAccount $marketplace, TrendyolService $service): JsonResponse
    {
        return $this->respond(fn () => $service->categories($marketplace));
    }

    public function sendProducts(MarketplaceAccount $marketplace): JsonResponse
    {
        SendProductsToTrendyolJob::dispatch($marketplace);
        $marketplace->update(['last_error' => null]);

        return response()->json([
            'message' => 'Trendyol urun gonderimi kuyruga alindi.',
            'queued' => true,
        ], 202);
    }

    public function updatePriceInventory(MarketplaceAccount $marketplace): JsonResponse
    {
        UpdateTrendyolPriceInventoryJob::dispatch($marketplace);
        $marketplace->update(['last_error' => null]);

        return response()->json([
            'message' => 'Trendyol stok/fiyat guncellemesi kuyruga alindi.',
            'queued' => true,
        ], 202);
    }

    public function pullOrders(MarketplaceAccount $marketplace): JsonResponse
    {
        PullTrendyolOrdersJob::dispatch($marketplace);
        $marketplace->update(['last_error' => null]);

        return response()->json([
            'message' => 'Trendyol siparis cekme isi kuyruga alindi.',
            'queued' => true,
        ], 202);
    }

    private function respond(callable $callback): JsonResponse
    {
        try {
            return response()->json($callback());
        } catch (MarketplaceApiException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'details' => $exception->details,
            ], $exception->statusCode && $exception->statusCode >= 400 ? $exception->statusCode : 422);
        }
    }
}
