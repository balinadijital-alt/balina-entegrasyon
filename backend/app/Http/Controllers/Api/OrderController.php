<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\Accounting\ProcessInvoiceJob;
use App\Jobs\Shipping\ProcessShipmentJob;
use App\Models\AccountingAccount;
use App\Models\CurrentAccount;
use App\Models\CurrentAccountTransaction;
use App\Models\Invoice;
use App\Models\Order;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Services\Orders\OrderOperationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Order::query()
            ->with([
                'company:id,name',
                'marketplaceAccount:id,name,code',
                'items:id,order_id,marketplace_account_id,provider_line_id,barcode,sku,name,quantity,unit_price,provider_status,cancel_reason_id',
                'marketplaceOperations:id,order_id,order_item_id,operation_type,status,error_code,error_message,provider_shipment_package_id,created_at',
                'shipments.account.carrier:id,code,name',
                'payments.account.provider:id,code,name',
                'invoices:id,order_id,status,invoice_number,pdf_path,pdf_url',
            ])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->filled('marketplace_code'), fn ($query) => $query->where('marketplace_code', $request->string('marketplace_code')))
            ->when($request->filled('payment_status'), fn ($query) => $query->where(fn ($inner) => $inner
                ->where('payment_status', $request->string('payment_status'))
                ->orWhereHas('payments', fn ($payment) => $payment->where('status', $request->string('payment_status')))))
            ->when($request->filled('shipping_status'), fn ($query) => $query->where(fn ($inner) => $inner
                ->where('shipping_status', $request->string('shipping_status'))
                ->orWhereHas('shipments', fn ($shipment) => $shipment->where('status', $request->string('shipping_status')))))
            ->when($request->filled('invoice_status'), fn ($query) => $query->where(fn ($inner) => $inner
                ->where('invoice_status', $request->string('invoice_status'))
                ->orWhereHas('invoices', fn ($invoice) => $invoice->where('status', $request->string('invoice_status')))))
            ->when($request->filled('date_from'), fn ($query) => $query->whereDate('created_at', '>=', $request->date('date_from')))
            ->when($request->filled('date_to'), fn ($query) => $query->whereDate('created_at', '<=', $request->date('date_to')))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = $request->string('search');
                $query->where(fn ($inner) => $inner
                    ->where('marketplace_order_id', 'like', "%{$search}%")
                    ->orWhere('customer_name', 'like', "%{$search}%")
                    ->orWhere('customer_email', 'like', "%{$search}%")
                    ->orWhere('customer_phone', 'like', "%{$search}%"));
            })
            ->latest()
            ->paginate(20));
    }

    public function show(Order $order): JsonResponse
    {
        $this->abortIfNotTenant(request(), $order);

        return response()->json($order->load([
            'company',
            'marketplaceAccount:id,name,code',
            'items.operations',
            'marketplaceOperations.orderItem',
            'shipments.account.carrier',
            'payments.account.provider',
            'invoices.account.integration',
            'currentTransactions.currentAccount',
            'notes.user:id,name,email',
            'operationHistories.user:id,name,email',
        ]));
    }

    public function update(Request $request, Order $order, OrderOperationService $operations): JsonResponse
    {
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'status' => ['required', 'string', 'max:64'],
            'note' => ['nullable', 'string'],
        ]);

        $updated = $operations->changeStatus($order, $data['status'], $request->user(), ['note' => $data['note'] ?? null]);

        return response()->json($updated);
    }

    public function statuses(): JsonResponse
    {
        return response()->json(OrderOperationService::STATUSES);
    }

    public function addNote(Request $request, Order $order, OrderOperationService $operations): JsonResponse
    {
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'note' => ['required', 'string', 'max:5000'],
            'type' => ['nullable', 'in:internal,customer,warehouse,accounting,shipping'],
        ]);

        return response()->json($operations->addNote($order, $data['note'], $data['type'] ?? 'internal', $request->user()), 201);
    }

    public function transition(Request $request, Order $order, OrderOperationService $operations): JsonResponse
    {
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'status' => ['required', 'string', 'max:64'],
            'payload' => ['nullable', 'array'],
        ]);

        return response()->json($operations->changeStatus($order, $data['status'], $request->user(), $data['payload'] ?? []));
    }

    public function requestResolution(Request $request, Order $order, OrderOperationService $operations): JsonResponse
    {
        $this->abortIfNotTenant($request, $order);

        $data = $request->validate([
            'type' => ['required', 'in:cancel,return,problem'],
            'reason' => ['required', 'string', 'max:5000'],
        ]);

        return response()->json($operations->requestResolution($order, $data['type'], $data['reason'], $request->user()));
    }

    public function bulk(Request $request, OrderOperationService $operations): JsonResponse
    {
        $data = $request->validate([
            'order_ids' => ['required', 'array', 'min:1'],
            'order_ids.*' => ['integer', 'exists:orders,id'],
            'action' => ['required', 'in:create_shipment,create_invoice,change_status'],
            'status' => ['nullable', 'string', 'max:64'],
            'shipping_account_id' => ['nullable', 'exists:shipping_accounts,id'],
            'accounting_account_id' => ['nullable', 'exists:accounting_accounts,id'],
            'type' => ['nullable', 'in:einvoice,earchive'],
        ]);

        $orders = Order::query()
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->whereIn('id', $data['order_ids'])
            ->get();
        $processed = 0;

        foreach ($orders as $order) {
            if ($data['action'] === 'change_status') {
                $operations->changeStatus($order, $data['status'] ?? 'preparing', $request->user(), ['bulk' => true]);
                $processed++;
            }

            if ($data['action'] === 'create_shipment') {
                $this->queueShipment($order, $data['shipping_account_id'] ?? null, $operations, $request);
                $processed++;
            }

            if ($data['action'] === 'create_invoice') {
                $this->queueInvoice($order, $data['accounting_account_id'] ?? null, $data['type'] ?? 'earchive', $operations, $request);
                $processed++;
            }
        }

        return response()->json(['message' => "{$processed} siparis icin toplu islem kuyruga alindi.", 'processed' => $processed]);
    }

    private function queueShipment(Order $order, ?int $accountId, OrderOperationService $operations, Request $request): Shipment
    {
        $account = ShippingAccount::with('carrier')->findOrFail($accountId);
        $shipment = Shipment::create([
            'order_id' => $order->id,
            'shipping_account_id' => $account->id,
            'carrier_code' => $account->carrier->code,
            'status' => 'queued',
            'last_action' => 'create',
            'request_payload' => ['bulk' => true],
        ]);
        ProcessShipmentJob::dispatch($shipment, 'create', ['bulk' => true]);
        $order->update(['shipping_status' => 'queued']);
        $operations->recordHistory($order, 'shipment_queued', $order->status, $order->status, ['shipment_id' => $shipment->id], $request->user());

        return $shipment;
    }

    private function queueInvoice(Order $order, ?int $accountId, string $type, OrderOperationService $operations, Request $request): Invoice
    {
        $account = AccountingAccount::findOrFail($accountId);
        $current = CurrentAccount::firstOrCreate(
            ['company_id' => $order->company_id, 'email' => $order->customer_email],
            ['type' => 'customer', 'name' => $order->customer_name ?: 'Musteri', 'is_active' => true]
        );
        $lines = data_get($order->payload, 'lines', data_get($order->payload, 'items', [['name' => 'Siparis', 'quantity' => 1, 'total' => (float) $order->total_amount]]));
        $grandTotal = collect($lines)->sum(fn ($line) => (float) ($line['total'] ?? $line['amount'] ?? 0)) ?: (float) $order->total_amount;
        $taxTotal = round($grandTotal * 20 / 120, 2);
        $invoice = Invoice::create([
            'company_id' => $order->company_id,
            'order_id' => $order->id,
            'current_account_id' => $current->id,
            'accounting_account_id' => $account->id,
            'type' => $type,
            'scenario' => 'basic',
            'status' => 'queued',
            'subtotal' => $grandTotal - $taxTotal,
            'tax_total' => $taxTotal,
            'grand_total' => $grandTotal,
            'lines' => $lines,
        ]);
        CurrentAccountTransaction::create([
            'current_account_id' => $current->id,
            'order_id' => $order->id,
            'type' => 'invoice',
            'direction' => 'debit',
            'amount' => $grandTotal,
            'description' => 'Toplu siparis faturasi',
            'transaction_date' => now(),
        ]);
        $current->increment('balance', $grandTotal);
        ProcessInvoiceJob::dispatch($invoice, 'create');
        $order->update(['invoice_status' => 'queued']);
        $operations->recordHistory($order, 'invoice_queued', $order->status, $order->status, ['invoice_id' => $invoice->id], $request->user());

        return $invoice;
    }
}
