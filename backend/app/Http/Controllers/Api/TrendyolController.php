<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\MarketplaceApiException;
use App\Http\Controllers\Controller;
use App\Jobs\Trendyol\PullTrendyolOrdersJob;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use App\Jobs\Trendyol\UpdateTrendyolPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Queue\SyncRunService;
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

    public function sendProducts(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'trendyol_products');
            SendProductsToTrendyolJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json([
                'message' => 'Trendyol urun gonderimi kuyruga alindi.',
                'queued' => true,
                'sync_run_id' => $syncRun->id,
            ], 202);
        });
    }

    public function updatePriceInventory(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'trendyol_price_inventory');
            UpdateTrendyolPriceInventoryJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json([
                'message' => 'Trendyol stok/fiyat guncellemesi kuyruga alindi.',
                'queued' => true,
                'sync_run_id' => $syncRun->id,
            ], 202);
        });
    }

    public function pullOrders(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'trendyol_orders');
            PullTrendyolOrdersJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json([
                'message' => 'Trendyol siparis cekme isi kuyruga alindi.',
                'queued' => true,
                'sync_run_id' => $syncRun->id,
            ], 202);
        });
    }

    private function respond(callable $callback): JsonResponse
    {
        try {
            $response = $callback();

            return $response instanceof JsonResponse ? $response : response()->json($response);
        } catch (MarketplaceApiException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'details' => $exception->details,
            ], $exception->statusCode && $exception->statusCode >= 400 ? $exception->statusCode : 422);
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }
    }
}
