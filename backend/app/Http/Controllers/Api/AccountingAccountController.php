<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccountingAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountingAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(AccountingAccount::with(['company:id,name', 'integration:id,code,name'])
            ->when($this->tenantCompanyId($request), fn ($q, $companyId) => $q->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->integer('company_id')))
            ->latest()->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $account = AccountingAccount::create($this->forceTenantCompany($request, $this->validated($request)));
        return response()->json($account->load(['company:id,name', 'integration:id,code,name']), 201);
    }

    public function update(Request $request, AccountingAccount $accountingAccount): JsonResponse
    {
        $this->abortIfAccountNotTenant($request, $accountingAccount);

        $accountingAccount->update($this->forceTenantCompany($request, $this->validated($request, true)));
        return response()->json($accountingAccount->load(['company:id,name', 'integration:id,code,name']));
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'company_id' => [$partial ? 'sometimes' : 'required', 'exists:companies,id'],
            'accounting_integration_id' => [$partial ? 'sometimes' : 'required', 'exists:accounting_integrations,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'client_id' => ['nullable', 'string'], 'client_secret' => ['nullable', 'string'],
            'username' => ['nullable', 'string'], 'password' => ['nullable', 'string'],
            'api_key' => ['nullable', 'string'], 'api_secret' => ['nullable', 'string'],
            'base_url' => ['nullable', 'url'], 'settings' => ['nullable', 'array'], 'is_active' => ['boolean'],
        ]);
    }
}
