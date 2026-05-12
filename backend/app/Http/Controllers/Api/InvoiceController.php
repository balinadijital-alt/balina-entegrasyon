<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\Accounting\ProcessInvoiceJob;
use App\Models\AccountingLog;
use App\Models\CurrentAccount;
use App\Models\CurrentAccountTransaction;
use App\Models\Invoice;
use App\Models\Order;
use App\Services\Orders\OrderOperationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class InvoiceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Invoice::with(['company:id,name', 'order:id,marketplace_order_id', 'currentAccount:id,name', 'account.integration:id,code,name'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->latest()->paginate(30));
    }

    public function logs(): JsonResponse
    {
        return response()->json(AccountingLog::latest()->paginate(50));
    }

    public function createForOrder(Order $order, Request $request, OrderOperationService $operations): JsonResponse
    {
        $data = $request->validate([
            'accounting_account_id' => ['required', 'exists:accounting_accounts,id'],
            'current_account_id' => ['nullable', 'exists:current_accounts,id'],
            'type' => ['required', 'in:einvoice,earchive'],
            'scenario' => ['nullable', 'string', 'max:64'],
            'lines' => ['nullable', 'array'],
        ]);

        $current = isset($data['current_account_id']) ? CurrentAccount::find($data['current_account_id']) : CurrentAccount::firstOrCreate(
            ['company_id' => $order->company_id, 'email' => $order->customer_email],
            ['type' => 'customer', 'name' => $order->customer_name ?: 'Musteri', 'is_active' => true]
        );
        $lines = $data['lines'] ?? data_get($order->payload, 'lines', [['name' => 'Siparis', 'quantity' => 1, 'total' => (float) $order->total_amount]]);
        $grandTotal = collect($lines)->sum(fn ($line) => (float) ($line['total'] ?? $line['amount'] ?? 0)) ?: (float) $order->total_amount;
        $taxTotal = round($grandTotal * 20 / 120, 2);

        $invoice = Invoice::create([
            'company_id' => $order->company_id,
            'order_id' => $order->id,
            'current_account_id' => $current->id,
            'accounting_account_id' => $data['accounting_account_id'],
            'type' => $data['type'],
            'scenario' => $data['scenario'] ?? 'basic',
            'status' => 'queued',
            'subtotal' => $grandTotal - $taxTotal,
            'tax_total' => $taxTotal,
            'grand_total' => $grandTotal,
            'lines' => $lines,
        ]);
        CurrentAccountTransaction::create([
            'current_account_id' => $current->id, 'order_id' => $order->id, 'type' => 'invoice',
            'direction' => 'debit', 'amount' => $grandTotal, 'description' => 'Siparis faturasi', 'transaction_date' => now(),
        ]);
        $current->increment('balance', $grandTotal);
        ProcessInvoiceJob::dispatch($invoice, 'create');
        $order->update(['invoice_status' => 'queued']);
        $operations->recordHistory($order, 'invoice_queued', $order->status, $order->status, ['invoice_id' => $invoice->id], $request->user());

        return response()->json(['message' => 'Fatura kuyruga alindi.', 'invoice_id' => $invoice->id, 'queued' => true], 202);
    }

    public function returnInvoice(Invoice $invoice): JsonResponse
    {
        $return = $invoice->replicate(['invoice_number', 'external_id', 'pdf_path', 'pdf_url', 'response_payload']);
        $return->type = 'return';
        $return->status = 'queued';
        $return->grand_total = -1 * abs((float) $invoice->grand_total);
        $return->subtotal = -1 * abs((float) $invoice->subtotal);
        $return->tax_total = -1 * abs((float) $invoice->tax_total);
        $return->save();
        ProcessInvoiceJob::dispatch($return, 'return');
        return response()->json(['message' => 'Iade faturasi kuyruga alindi.', 'invoice_id' => $return->id, 'queued' => true], 202);
    }

    public function query(Invoice $invoice): JsonResponse
    {
        ProcessInvoiceJob::dispatch($invoice, 'query');
        return response()->json(['message' => 'Fatura durum sorgusu kuyruga alindi.', 'queued' => true], 202);
    }

    public function pdf(Invoice $invoice): JsonResponse
    {
        ProcessInvoiceJob::dispatch($invoice, 'pdf');
        return response()->json(['message' => 'Fatura PDF olusturma kuyruga alindi.', 'queued' => true], 202);
    }

    public function download(Invoice $invoice)
    {
        if ($invoice->pdf_path && Storage::disk('public')->exists($invoice->pdf_path)) return Storage::disk('public')->download($invoice->pdf_path);
        return response()->json(['message' => 'Fatura PDF henuz olusmadi.'], 404);
    }
}
