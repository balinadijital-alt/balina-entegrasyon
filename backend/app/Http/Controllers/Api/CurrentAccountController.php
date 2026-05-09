<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CurrentAccount;
use App\Models\CurrentAccountTransaction;
use App\Services\Accounting\TaxNumberValidator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurrentAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(CurrentAccount::withCount('transactions')
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->integer('company_id')))
            ->latest()->paginate(30));
    }

    public function store(Request $request, TaxNumberValidator $validator): JsonResponse
    {
        $data = $this->validated($request);
        $taxId = $data['tax_number'] ?? $data['identity_number'] ?? null;
        if ($taxId && ! $validator->validate($taxId)) return response()->json(['message' => 'VKN/TCKN dogrulanamadi.'], 422);
        return response()->json(CurrentAccount::create($data), 201);
    }

    public function transactions(Request $request): JsonResponse
    {
        return response()->json(CurrentAccountTransaction::with(['currentAccount:id,name', 'order:id,marketplace_order_id'])
            ->when($request->filled('current_account_id'), fn ($q) => $q->where('current_account_id', $request->integer('current_account_id')))
            ->latest()->paginate(50));
    }

    public function addTransaction(CurrentAccount $currentAccount, Request $request): JsonResponse
    {
        $data = $request->validate([
            'order_id' => ['nullable', 'exists:orders,id'], 'type' => ['required', 'in:invoice,collection,payment,refund,adjustment'],
            'direction' => ['required', 'in:debit,credit'], 'amount' => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string'], 'transaction_date' => ['nullable', 'date'], 'payload' => ['nullable', 'array'],
        ]);
        $transaction = $currentAccount->transactions()->create($data + ['transaction_date' => $data['transaction_date'] ?? now()]);
        $delta = $data['direction'] === 'debit' ? (float) $data['amount'] : -1 * (float) $data['amount'];
        $currentAccount->increment('balance', $delta);
        return response()->json($transaction->load('currentAccount'), 201);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'company_id' => ['required', 'exists:companies,id'], 'type' => ['required', 'in:customer,supplier'],
            'name' => ['required', 'string', 'max:255'], 'code' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email'], 'phone' => ['nullable', 'string', 'max:64'], 'tax_office' => ['nullable', 'string', 'max:255'],
            'tax_number' => ['nullable', 'string', 'max:32'], 'identity_number' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string'], 'city' => ['nullable', 'string', 'max:128'], 'district' => ['nullable', 'string', 'max:128'],
            'is_active' => ['boolean'],
        ]);
    }
}
