<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\MarketplaceApiException;
use App\Http\Controllers\Controller;
use App\Jobs\Trendyol\PullTrendyolOrdersJob;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use App\Jobs\Trendyol\UpdateTrendyolPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Audit\AuditLogger;
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

    public function archiveProducts(MarketplaceAccount $marketplace, TrendyolService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'barcodes' => ['required', 'array', 'min:1', 'max:1000'],
            'barcodes.*' => ['required', 'string', 'max:128'],
            'archive' => ['boolean'],
        ]);

        $audit->logAction($request, 'marketplace', 'products.archive', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'barcodes_count' => count($data['barcodes']),
            'archive' => $data['archive'] ?? true,
        ]);

        return $this->respond(fn () => $service->archiveProducts($marketplace, $data['barcodes'], $data['archive'] ?? true));
    }

    public function sendProducts(MarketplaceAccount $marketplace, SyncRunService $runs, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(function () use ($marketplace, $runs, $request, $audit) {
            $syncRun = $runs->create($marketplace, 'trendyol_products');
            SendProductsToTrendyolJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);
            $audit->logAction($request, 'marketplace', 'products.send', $marketplace, [
                'marketplace_code' => $marketplace->code,
                'marketplace_account_id' => $marketplace->id,
                'sync_run_id' => $syncRun->id,
                'queued' => true,
            ]);

            return response()->json([
                'message' => 'Trendyol urun gonderimi kuyruga alindi.',
                'queued' => true,
                'sync_run_id' => $syncRun->id,
            ], 202);
        });
    }

    public function updatePriceInventory(MarketplaceAccount $marketplace, SyncRunService $runs, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(function () use ($marketplace, $runs, $request, $audit) {
            $syncRun = $runs->create($marketplace, 'trendyol_price_inventory');
            UpdateTrendyolPriceInventoryJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);
            $audit->logAction($request, 'marketplace', 'price_inventory.update', $marketplace, [
                'marketplace_code' => $marketplace->code,
                'marketplace_account_id' => $marketplace->id,
                'sync_run_id' => $syncRun->id,
                'queued' => true,
            ]);

            return response()->json([
                'message' => 'Trendyol stok/fiyat guncellemesi kuyruga alindi.',
                'queued' => true,
                'sync_run_id' => $syncRun->id,
            ], 202);
        });
    }

    public function pullOrders(MarketplaceAccount $marketplace, SyncRunService $runs, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(function () use ($marketplace, $runs, $request, $audit) {
            $syncRun = $runs->create($marketplace, 'trendyol_orders');
            PullTrendyolOrdersJob::dispatch($marketplace, $syncRun);
            $marketplace->update(['last_error' => null]);
            $audit->logAction($request, 'marketplace', 'orders.pull', $marketplace, [
                'marketplace_code' => $marketplace->code,
                'marketplace_account_id' => $marketplace->id,
                'sync_run_id' => $syncRun->id,
                'queued' => true,
            ]);

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

    public function webhookPackages(MarketplaceAccount $marketplace, TrendyolService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $audit->logAction($request, 'marketplace', 'webhook.packages', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
        ], null, $request->all());

        return $this->respond(fn () => $service->webhookPackages($marketplace, $request->all()));
    }

    public function returns(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->returns($marketplace, $request->query()));
    }

    public function answerReturn(MarketplaceAccount $marketplace, TrendyolService $service, string $claimId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate(['approve' => ['required', 'boolean'], 'payload' => ['nullable', 'array']]);
        $audit->logAction($request, 'marketplace', 'returns.answer', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'claim_id' => $claimId,
            'approve' => $data['approve'],
        ], null, $data['payload'] ?? []);

        return $this->respond(fn () => $service->answerReturn($marketplace, $claimId, $data['approve'], $data['payload'] ?? []));
    }

    public function questions(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        return $this->respond(fn () => $service->questions($marketplace, $request->query()));
    }

    public function answerQuestion(MarketplaceAccount $marketplace, TrendyolService $service, string $questionId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate(['answer' => ['required', 'string', 'max:5000']]);
        $audit->logAction($request, 'marketplace', 'questions.answer', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'question_id' => $questionId,
        ], null, ['answer_length' => strlen($data['answer'])]);

        return $this->respond(fn () => $service->answerQuestion($marketplace, $questionId, $data['answer']));
    }

    public function sendInvoiceLink(MarketplaceAccount $marketplace, TrendyolService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate(['invoice_link' => ['required', 'url', 'max:2000']]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
            'type' => 'link',
        ], null, ['invoice_link' => $data['invoice_link']]);

        return $this->respond(fn () => $service->sendInvoiceLink($marketplace, $packageId, $data['invoice_link']));
    }

    public function sendInvoiceFile(MarketplaceAccount $marketplace, TrendyolService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'file_name' => ['required', 'string', 'max:255'],
            'file_content_base64' => ['required', 'string'],
        ]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
            'type' => 'file',
        ], null, ['file_name' => $data['file_name'], 'file_content_base64' => $data['file_content_base64']]);

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
