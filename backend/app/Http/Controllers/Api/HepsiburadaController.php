<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\MarketplaceApiException;
use App\Http\Controllers\Controller;
use App\Jobs\Hepsiburada\PullHepsiburadaOrdersJob;
use App\Jobs\Hepsiburada\SendProductsToHepsiburadaJob;
use App\Jobs\Hepsiburada\UpdateHepsiburadaPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\HepsiburadaService;
use App\Services\Queue\SyncRunService;
use Illuminate\Http\JsonResponse;

class HepsiburadaController extends Controller
{
    public function test(MarketplaceAccount $marketplace, HepsiburadaService $service): JsonResponse
    {
        return $this->respond(fn () => $service->testConnection($marketplace));
    }

    public function categories(MarketplaceAccount $marketplace, HepsiburadaService $service): JsonResponse
    {
        return $this->respond(fn () => $service->categories($marketplace));
    }

    public function sendProducts(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'hepsiburada_products');
            SendProductsToHepsiburadaJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json(['message' => 'Hepsiburada urun gonderimi kuyruga alindi.', 'queued' => true, 'sync_run_id' => $syncRun->id], 202);
        });
    }

    public function updatePriceInventory(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'hepsiburada_price_inventory');
            UpdateHepsiburadaPriceInventoryJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json(['message' => 'Hepsiburada stok/fiyat guncellemesi kuyruga alindi.', 'queued' => true, 'sync_run_id' => $syncRun->id], 202);
        });
    }

    public function pullOrders(MarketplaceAccount $marketplace, SyncRunService $runs): JsonResponse
    {
        return $this->respond(function () use ($marketplace, $runs) {
            $syncRun = $runs->create($marketplace, 'hepsiburada_orders');
            PullHepsiburadaOrdersJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);

            return response()->json(['message' => 'Hepsiburada siparis cekme isi kuyruga alindi.', 'queued' => true, 'sync_run_id' => $syncRun->id], 202);
        });
    }

    private function respond(callable $callback): JsonResponse
    {
        try {
            $response = $callback();
            return $response instanceof JsonResponse ? $response : response()->json($response);
        } catch (MarketplaceApiException $exception) {
            return response()->json(['message' => $exception->getMessage(), 'details' => $exception->details], $exception->statusCode && $exception->statusCode >= 400 ? $exception->statusCode : 422);
        } catch (\RuntimeException $exception) {
            return response()->json(['message' => $exception->getMessage()], 409);
        }
    }
}
