<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentAccount;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PaymentAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(PaymentAccount::with(['company:id,name', 'provider:id,code,name'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(20));
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $payload = $this->forceTenantCompany($request, $this->validated($request));
        $account = PaymentAccount::create($payload);
        $audit->logAction($request, 'credentials', 'payment_account.create', $account, ['account_type' => 'payment'], null, $account->toArray());

        return response()->json($account->load(['company:id,name', 'provider:id,code,name']), 201);
    }

    public function update(Request $request, PaymentAccount $paymentAccount, AuditLogger $audit): JsonResponse
    {
        $this->abortIfAccountNotTenant($request, $paymentAccount);

        $old = $paymentAccount->fresh()->makeVisible($this->secretFields())->toArray();
        $payload = $audit->preserveBlankSecrets($paymentAccount, $this->forceTenantCompany($request, $this->validated($request, true)), $this->secretFields());
        $paymentAccount->update($payload);
        $audit->logAction($request, 'credentials', 'payment_account.update', $paymentAccount, ['account_type' => 'payment'], $old, $paymentAccount->fresh()->makeVisible($this->secretFields())->toArray());

        return response()->json($paymentAccount->load(['company:id,name', 'provider:id,code,name']));
    }

    public function destroy(PaymentAccount $paymentAccount, AuditLogger $audit): JsonResponse
    {
        $this->abortIfAccountNotTenant(request(), $paymentAccount);

        $old = $paymentAccount->fresh()->makeVisible($this->secretFields())->toArray();
        $paymentAccount->delete();
        $audit->logAction(request(), 'credentials', 'payment_account.delete', $paymentAccount, ['account_type' => 'payment'], $old);

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

    private function secretFields(): array
    {
        return ['api_key', 'api_secret', 'client_secret', 'webhook_secret'];
    }
}
