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
use Illuminate\Http\Request;

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

    public function brands(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->brands($marketplace, $request->query()));
    }

    public function categoryAttributes(MarketplaceAccount $marketplace, TrendyolService $service, int|string $categoryId, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->categoryAttributes($marketplace, $categoryId, $request->boolean('v2', true)));
    }

    public function categoryAttributeValues(MarketplaceAccount $marketplace, TrendyolService $service, int|string $categoryId, int|string $attributeId, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->categoryAttributeValues($marketplace, $categoryId, $attributeId, $request->query()));
    }

    public function batchResult(MarketplaceAccount $marketplace, TrendyolService $service, string $batchRequestId): JsonResponse
    {
        return $this->respond(fn () => $service->batchResult($marketplace, $batchRequestId));
    }

    public function filterProducts(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->filterProducts($marketplace, $request->query()));
    }

    public function archiveProducts(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        $data = $request->validate([
            'barcodes' => ['required', 'array', 'min:1', 'max:1000'],
            'barcodes.*' => ['required', 'string', 'max:128'],
            'archive' => ['boolean'],
        ]);

        return $this->respond(fn () => $service->archiveProducts($marketplace, $data['barcodes'], $data['archive'] ?? true));
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

    public function pullOrdersStream(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->pullOrdersStream($marketplace, $request->query()));
    }

    public function webhookPackages(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->webhookPackages($marketplace, $request->all()));
    }

    public function returns(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->returns($marketplace, $request->query()));
    }

    public function answerReturn(MarketplaceAccount $marketplace, TrendyolService $service, string $claimId, Request $request): JsonResponse
    {
        $data = $request->validate(['approve' => ['required', 'boolean'], 'payload' => ['nullable', 'array']]);

        return $this->respond(fn () => $service->answerReturn($marketplace, $claimId, $data['approve'], $data['payload'] ?? []));
    }

    public function questions(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->questions($marketplace, $request->query()));
    }

    public function answerQuestion(MarketplaceAccount $marketplace, TrendyolService $service, string $questionId, Request $request): JsonResponse
    {
        $data = $request->validate(['answer' => ['required', 'string', 'max:5000']]);

        return $this->respond(fn () => $service->answerQuestion($marketplace, $questionId, $data['answer']));
    }

    public function sendInvoiceLink(MarketplaceAccount $marketplace, TrendyolService $service, string $packageId, Request $request): JsonResponse
    {
        $data = $request->validate(['invoice_link' => ['required', 'url', 'max:2000']]);

        return $this->respond(fn () => $service->sendInvoiceLink($marketplace, $packageId, $data['invoice_link']));
    }

    public function sendInvoiceFile(MarketplaceAccount $marketplace, TrendyolService $service, string $packageId, Request $request): JsonResponse
    {
        $data = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'file_content_base64' => ['required', 'string'],
        ]);

        return $this->respond(fn () => $service->sendInvoiceFile($marketplace, $packageId, $data['file_name'], $data['file_content_base64']));
    }

    public function commonLabelBarcode(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->commonLabelBarcode($marketplace, $request->query()));
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
