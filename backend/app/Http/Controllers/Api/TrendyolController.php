<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\MarketplaceApiException;
use App\Http\Controllers\Controller;
use App\Jobs\Trendyol\PullTrendyolOrdersJob;
use App\Jobs\Trendyol\SendProductsToTrendyolJob;
use App\Jobs\Trendyol\UpdateTrendyolPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Services\Marketplaces\MarketplaceOrderOperationService;
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

    public function createTestOrder(MarketplaceAccount $marketplace, TrendyolService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'customer' => ['required', 'array'],
            'invoiceAddress' => ['required', 'array'],
            'shippingAddress' => ['required', 'array'],
            'seller' => ['required', 'array'],
            'lines' => ['required', 'array', 'min:1', 'max:1'],
            'lines.*.barcode' => ['required', 'string', 'max:128'],
            'lines.*.quantity' => ['required', 'integer', 'min:1'],
            'lines.*.price' => ['required', 'numeric', 'min:0'],
            'lines.*.productName' => ['required', 'string', 'max:255'],
        ]);

        $audit->logAction($request, 'marketplace', 'test_order.create', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'lines_count' => count($data['lines']),
            'stage_environment' => data_get($marketplace->metadata, 'environment') === 'stage',
        ]);

        return $this->respond(fn () => response()->json($service->createTestOrder($marketplace, $data), 201));
    }

    public function updateTestOrderStatus(MarketplaceAccount $marketplace, TrendyolService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'status' => ['required', 'string', 'in:Shipped,AtCollectionPoint,Delivered,UnDelivered,Returned'],
            'lines' => ['required', 'array', 'min:1'],
            'params' => ['nullable', 'array'],
        ]);

        $audit->logAction($request, 'marketplace', 'test_order.status_update', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
            'status' => $data['status'],
            'stage_environment' => data_get($marketplace->metadata, 'environment') === 'stage',
        ]);

        return $this->respond(fn () => response()->json($service->updateTestOrderStatus($marketplace, $packageId, $data), 201));
    }

    public function updatePackageStatus(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'status' => ['required', 'string', 'in:Picking,Invoiced,Shipped,Delivered,Cancelled'],
            'lines' => ['nullable', 'array'],
            'lines.*.lineId' => ['nullable', 'string', 'max:128'],
            'lines.*.provider_line_id' => ['nullable', 'string', 'max:128'],
            'lines.*.quantity' => ['nullable', 'integer', 'min:1'],
        ]);

        $audit->logAction($request, 'marketplace', 'orders.package_status', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
            'status' => $data['status'],
        ], null, $data);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol paket operasyonu kaydedildi.',
            'operation' => $service->updatePackageStatus($marketplace, $order, $data),
        ], 201));
    }

    public function cancelPackageItem(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'lineId' => ['required_without:provider_line_id', 'string', 'max:128'],
            'provider_line_id' => ['nullable', 'string', 'max:128'],
            'quantity' => ['required', 'integer', 'min:1'],
            'reasonId' => ['required_without:reason_id', 'string', 'max:128'],
            'reason_id' => ['nullable', 'string', 'max:128'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);

        $audit->logAction($request, 'marketplace', 'orders.cancel_item', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
            'line_id' => $data['lineId'] ?? $data['provider_line_id'] ?? null,
        ], null, $data);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol tedarik edememe operasyonu kaydedildi.',
            'operation' => $service->cancelPackageItem($marketplace, $order, $data),
        ], 201));
    }

    public function cargoProviders(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(fn () => $service->cargoProviders($marketplace, $request->query()));
    }

    public function updateBoxInfo(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'desi' => ['nullable', 'numeric', 'min:0.01'],
            'boxQuantity' => ['nullable', 'integer', 'min:1'],
            'box_quantity' => ['nullable', 'integer', 'min:1'],
            'weight' => ['nullable', 'numeric', 'min:0.01'],
        ]);
        $audit->logAction($request, 'marketplace', 'cargo.box_info', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
        ], null, $data);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol desi/koli operasyonu kaydedildi.',
            'operation' => $service->updateBoxInfo($marketplace, $order, $data),
        ], 201));
    }

    public function changeCargoProvider(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'cargoProviderId' => ['required_without:cargo_provider_id', 'string', 'max:128'],
            'cargo_provider_id' => ['nullable', 'string', 'max:128'],
            'cargoProviderName' => ['nullable', 'string', 'max:255'],
            'cargo_provider_name' => ['nullable', 'string', 'max:255'],
        ]);
        $audit->logAction($request, 'marketplace', 'cargo.provider_change', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
            'cargo_provider_id' => $data['cargoProviderId'] ?? $data['cargo_provider_id'] ?? null,
        ], null, $data);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol kargo firmasi operasyonu kaydedildi.',
            'operation' => $service->changeCargoProvider($marketplace, $order, $data),
        ], 201));
    }

    public function deliveredByService(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'serviceProvider' => ['nullable', 'string', 'max:255'],
            'service_provider' => ['nullable', 'string', 'max:255'],
            'deliveryDate' => ['nullable', 'date'],
            'delivery_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);
        $audit->logAction($request, 'marketplace', 'cargo.delivered_by_service', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
        ], null, $data);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol yetkili servis teslimat operasyonu kaydedildi.',
            'operation' => $service->deliveredByService($marketplace, $order, $data),
        ], 201));
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
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(fn () => $service->returns($marketplace, $request->query()));
    }

    public function returnClaims(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(fn () => $service->localReturnClaims($marketplace));
    }

    public function syncReturnClaims(MarketplaceAccount $marketplace, TrendyolService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $audit->logAction($request, 'marketplace', 'returns.claims.sync', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
        ], null, $request->query());

        return $this->respond(fn () => $service->syncReturnClaims($marketplace, $request->query()));
    }

    public function returnIssueReasons(MarketplaceAccount $marketplace, TrendyolService $service, Request $request): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(fn () => $service->getClaimIssueReasons($marketplace, $request->query()));
    }

    public function createReturnIssue(MarketplaceAccount $marketplace, TrendyolService $service, string $claimId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'claimLineItemId' => ['required_without:claim_line_item_id', 'string', 'max:128'],
            'claim_line_item_id' => ['nullable', 'string', 'max:128'],
            'reasonId' => ['required_without:reason_id', 'string', 'max:128'],
            'reason_id' => ['nullable', 'string', 'max:128'],
            'description' => ['nullable', 'string', 'max:500'],
        ]);
        $audit->logAction($request, 'marketplace', 'returns.issue.create', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'claim_id' => $claimId,
        ], null, ['claim_line_item_id' => $data['claimLineItemId'] ?? $data['claim_line_item_id'] ?? null, 'reason_id' => $data['reasonId'] ?? $data['reason_id'] ?? null]);

        return $this->respond(fn () => response()->json($service->createClaimIssue($marketplace, $claimId, $data), 201));
    }

    public function approveReturnClaim(MarketplaceAccount $marketplace, TrendyolService $service, string $claimId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'claimLineItemIds' => ['required_without:claim_line_item_ids', 'array', 'min:1'],
            'claimLineItemIds.*' => ['string', 'max:128'],
            'claim_line_item_ids' => ['nullable', 'array', 'min:1'],
            'claim_line_item_ids.*' => ['string', 'max:128'],
        ]);
        $ids = $data['claimLineItemIds'] ?? $data['claim_line_item_ids'] ?? [];
        $audit->logAction($request, 'marketplace', 'returns.approve', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'claim_id' => $claimId,
            'line_count' => count($ids),
        ]);

        return $this->respond(fn () => response()->json($service->approveClaimLineItems($marketplace, $claimId, $ids), 201));
    }

    public function returnClaimAudits(MarketplaceAccount $marketplace, TrendyolService $service, string $claimId, Request $request): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        return $this->respond(fn () => $service->getClaimItemAudits($marketplace, $claimId, $request->query()));
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

    public function sendInvoiceLink(MarketplaceAccount $marketplace, MarketplaceOrderOperationService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'invoiceLink' => ['required_without:invoice_link', 'url', 'max:2000'],
            'invoice_link' => ['nullable', 'url', 'max:2000'],
        ]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
            'type' => 'link',
        ], null, ['invoice_link' => '[masked]']);
        $order = $service->orderForPackage($marketplace, $packageId);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura link operasyonu kaydedildi.',
            'operation' => $service->sendInvoiceLink($marketplace, $order, ['invoiceLink' => $data['invoiceLink'] ?? $data['invoice_link'], 'shipmentPackageId' => $packageId]),
        ], 201));
    }

    public function deleteInvoiceLink(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);
        $audit->logAction($request, 'marketplace', 'invoice.delete', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
        ]);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura link silme operasyonu kaydedildi.',
            'operation' => $service->deleteInvoiceLink($marketplace, $order, $request->query()),
        ], 201));
    }

    public function deleteInvoiceLinkByPackage(MarketplaceAccount $marketplace, MarketplaceOrderOperationService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $audit->logAction($request, 'marketplace', 'invoice.delete', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
        ]);
        $order = $service->orderForPackage($marketplace, $packageId);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura link silme operasyonu kaydedildi.',
            'operation' => $service->deleteInvoiceLink($marketplace, $order, ['shipmentPackageId' => $packageId]),
        ], 201));
    }

    public function sendOrderInvoiceLink(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'invoiceLink' => ['required_without:invoice_link', 'url', 'max:2000'],
            'invoice_link' => ['nullable', 'url', 'max:2000'],
        ]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
            'type' => 'link',
        ], null, ['invoice_link' => '[masked]']);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura link operasyonu kaydedildi.',
            'operation' => $service->sendInvoiceLink($marketplace, $order, $data),
        ], 201));
    }

    public function sendInvoiceFile(MarketplaceAccount $marketplace, MarketplaceOrderOperationService $service, string $packageId, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $data = $request->validate([
            'fileName' => ['required_without:file_name', 'string', 'max:255'],
            'file_name' => ['nullable', 'string', 'max:255'],
            'fileContent' => ['required_without:file_content_base64', 'string'],
            'file_content_base64' => ['nullable', 'string'],
        ]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'package_id' => $packageId,
            'type' => 'file',
        ], null, ['file_name' => $data['fileName'] ?? $data['file_name'], 'file_content_base64' => '[masked]']);
        $order = $service->orderForPackage($marketplace, $packageId);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura dosyasi operasyonu kaydedildi.',
            'operation' => $service->sendInvoiceFile($marketplace, $order, [
                'shipmentPackageId' => $packageId,
                'fileName' => $data['fileName'] ?? $data['file_name'],
                'fileContent' => $data['fileContent'] ?? $data['file_content_base64'],
            ]),
        ], 201));
    }

    public function sendOrderInvoiceFile(MarketplaceAccount $marketplace, Order $order, MarketplaceOrderOperationService $service, Request $request, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'shipmentPackageId' => ['nullable', 'string', 'max:128'],
            'shipment_package_id' => ['nullable', 'string', 'max:128'],
            'fileName' => ['required_without:file_name', 'string', 'max:255'],
            'file_name' => ['nullable', 'string', 'max:255'],
            'fileContent' => ['required_without:file_content_base64', 'string'],
            'file_content_base64' => ['nullable', 'string'],
        ]);
        $audit->logAction($request, 'marketplace', 'invoice.send', $marketplace, [
            'marketplace_code' => $marketplace->code,
            'marketplace_account_id' => $marketplace->id,
            'order_id' => $order->id,
            'type' => 'file',
        ], null, ['file_name' => $data['fileName'] ?? $data['file_name'], 'file_content_base64' => '[masked]']);

        return $this->respond(fn () => response()->json([
            'message' => 'Trendyol fatura dosyasi operasyonu kaydedildi.',
            'operation' => $service->sendInvoiceFile($marketplace, $order, $data),
        ], 201));
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
