<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(PaymentAccount::with(['company:id,name', 'provider:id,code,name'])
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $account = PaymentAccount::create($this->validated($request));

        return response()->json($account->load(['company:id,name', 'provider:id,code,name']), 201);
    }

    public function update(Request $request, PaymentAccount $paymentAccount): JsonResponse
    {
        $paymentAccount->update($this->validated($request, true));

        return response()->json($paymentAccount->load(['company:id,name', 'provider:id,code,name']));
    }

    public function destroy(PaymentAccount $paymentAccount): JsonResponse
    {
        $paymentAccount->delete();

        return response()->json(status: 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'company_id' => [$partial ? 'sometimes' : 'required', 'exists:companies,id'],
            'payment_provider_id' => [$partial ? 'sometimes' : 'required', 'exists:payment_providers,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'merchant_id' => ['nullable', 'string'],
            'api_key' => ['nullable', 'string'],
            'api_secret' => ['nullable', 'string'],
            'client_id' => ['nullable', 'string'],
            'client_secret' => ['nullable', 'string'],
            'base_url' => ['nullable', 'url'],
            'webhook_secret' => ['nullable', 'string'],
            'installment_rates' => ['nullable', 'array'],
            'commission_rates' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
            'is_active' => ['boolean'],
        ]);
    }
}
