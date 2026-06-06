<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\Shipping\ProcessShipmentJob;
use App\Models\Order;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Services\Audit\AuditLogger;
use App\Services\Orders\OrderOperationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ShipmentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Shipment::with(['order:id,marketplace_order_id,customer_name', 'account.carrier:id,code,name'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->latest()
            ->paginate(30));
    }

    public function createForOrder(Order $order, Request $request, OrderOperationService $operations, AuditLogger $audit): JsonResponse
    {
        $this->abortIfOrderNotTenant($request, $order);

        $data = $request->validate([
            'shipping_account_id' => ['required', 'exists:shipping_accounts,id'],
            'payload' => ['nullable', 'array'],
        ]);

        $account = ShippingAccount::with('carrier')->findOrFail($data['shipping_account_id']);
        if ((int) $account->company_id !== (int) $order->company_id) {
            abort(403, 'Kargo hesabi bu firmaya ait degil.');
        }

        $shipment = Shipment::create([
            'order_id' => $order->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => $account->carrier->code,
            'status' => 'queued',
            'last_action' => 'create',
            'request_payload' => $data['payload'] ?? [],
        ]);

        ProcessShipmentJob::dispatch($shipment, 'create', $data['payload'] ?? []);
        $order->update(['shipping_status' => 'queued']);
        $operations->recordHistory($order, 'shipment_queued', $order->status, $order->status, ['shipment_id' => $shipment->id], $request->user());
        $audit->logAction($request, 'shipping', 'shipment.create', $shipment, [
            'company_id' => $order->company_id,
            'order_id' => $order->id,
            'shipment_id' => $shipment->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => $account->carrier->code,
            'queued' => true,
        ], null, ['payload' => $data['payload'] ?? []]);

        return response()->json(['message' => 'Kargo barkodu olusturma kuyruga alindi.', 'shipment_id' => $shipment->id, 'queued' => true], 202);
    }

    public function bulkLabels(Request $request, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'shipment_ids' => ['required', 'array', 'min:1'],
            'shipment_ids.*' => ['integer', 'exists:shipments,id'],
        ]);

        $shipments = Shipment::query()
            ->whereIn('id', $data['shipment_ids'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)))
            ->get();

        if ($shipments->count() !== count(array_unique($data['shipment_ids']))) {
            abort(403, 'Baska firmaya ait kargo kaydina erisim engellendi.');
        }

        $shipments->each(fn (Shipment $shipment) => ProcessShipmentJob::dispatch($shipment, 'label'));
        $audit->logAction($request, 'shipping', 'shipment.bulk_labels', $shipments->first(), [
            'company_id' => $shipments->first()?->order?->company_id,
            'shipment_count' => $shipments->count(),
            'shipment_ids' => $shipments->pluck('id')->values()->all(),
            'queued' => true,
        ]);

        return response()->json(['message' => 'Toplu etiket olusturma kuyruga alindi.', 'queued' => true], 202);
    }

    public function track(Shipment $shipment, AuditLogger $audit): JsonResponse
    {
        $this->abortIfShipmentNotTenant(request(), $shipment);

        ProcessShipmentJob::dispatch($shipment, 'track');
        $audit->logAction(request(), 'shipping', 'shipment.track', $shipment, $this->shipmentContext($shipment, 'track'));

        return response()->json(['message' => 'Kargo takip sorgusu kuyruga alindi.', 'queued' => true], 202);
    }

    public function label(Shipment $shipment, OrderOperationService $operations, AuditLogger $audit): JsonResponse
    {
        $this->abortIfShipmentNotTenant(request(), $shipment);

        ProcessShipmentJob::dispatch($shipment, 'label');
        $operations->recordHistory($shipment->order, 'shipment_label_queued', $shipment->order?->status, $shipment->order?->status, ['shipment_id' => $shipment->id]);
        $audit->logAction(request(), 'shipping', 'shipment.label', $shipment, $this->shipmentContext($shipment, 'label'));

        return response()->json(['message' => 'Kargo etiketi kuyruga alindi.', 'queued' => true], 202);
    }

    public function returnCode(Shipment $shipment, AuditLogger $audit): JsonResponse
    {
        $this->abortIfShipmentNotTenant(request(), $shipment);

        ProcessShipmentJob::dispatch($shipment, 'return');
        $audit->logAction(request(), 'shipping', 'shipment.return_code', $shipment, $this->shipmentContext($shipment, 'return'));

        return response()->json(['message' => 'Iade kargo kodu kuyruga alindi.', 'queued' => true], 202);
    }

    public function retry(Shipment $shipment, AuditLogger $audit): JsonResponse
    {
        $this->abortIfShipmentNotTenant(request(), $shipment);

        $action = $shipment->last_action ?: 'create';
        ProcessShipmentJob::dispatch($shipment, $action, $shipment->request_payload ?? []);
        $audit->logAction(request(), 'shipping', 'shipment.retry', $shipment, $this->shipmentContext($shipment, $action));

        return response()->json(['message' => 'Kargo islemi tekrar kuyruga alindi.', 'queued' => true], 202);
    }

    public function downloadLabel(Shipment $shipment)
    {
        $this->abortIfShipmentNotTenant(request(), $shipment);

        if ($shipment->label_path && Storage::disk('public')->exists($shipment->label_path)) {
            return Storage::disk('public')->download($shipment->label_path);
        }

        return response()->json(['message' => 'Etiket dosyasi henuz olusmadi.'], 404);
    }

    private function shipmentContext(Shipment $shipment, string $action): array
    {
        return [
            'company_id' => $shipment->order?->company_id,
            'order_id' => $shipment->order_id,
            'shipment_id' => $shipment->id,
            'carrier_code' => $shipment->carrier_code,
            'last_action' => $action,
            'queued' => true,
        ];
    }
}
