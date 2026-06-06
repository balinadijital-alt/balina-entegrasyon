<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ShippingAccount;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ShippingAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ShippingAccount::with(['company:id,name', 'carrier:id,code,name'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(20));
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $account = ShippingAccount::create($this->forceTenantCompany($request, $this->validated($request)));
        $audit->logAction($request, 'credentials', 'shipping_account.create', $account, ['account_type' => 'shipping'], null, $account->toArray());

        return response()->json($account->load(['company:id,name', 'carrier:id,code,name']), 201);
    }

    public function update(Request $request, ShippingAccount $shippingAccount, AuditLogger $audit): JsonResponse
    {
        $this->abortIfAccountNotTenant($request, $shippingAccount);

        $old = $shippingAccount->fresh()->makeVisible($this->secretFields())->toArray();
        $payload = $audit->preserveBlankSecrets($shippingAccount, $this->forceTenantCompany($request, $this->validated($request, true)), $this->secretFields());
        $shippingAccount->update($payload);
        $audit->logAction($request, 'credentials', 'shipping_account.update', $shippingAccount, ['account_type' => 'shipping'], $old, $shippingAccount->fresh()->makeVisible($this->secretFields())->toArray());

        return response()->json($shippingAccount->load(['company:id,name', 'carrier:id,code,name']));
    }

    public function destroy(ShippingAccount $shippingAccount, AuditLogger $audit): JsonResponse
    {
        $this->abortIfAccountNotTenant(request(), $shippingAccount);

        $old = $shippingAccount->fresh()->makeVisible($this->secretFields())->toArray();
        $shippingAccount->delete();
        $audit->logAction(request(), 'credentials', 'shipping_account.delete', $shippingAccount, ['account_type' => 'shipping'], $old);

        return response()->json(status: 204);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'company_id' => [$partial ? 'sometimes' : 'required', 'exists:companies,id'],
            'shipping_carrier_id' => [$partial ? 'sometimes' : 'required', 'exists:shipping_carriers,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'customer_code' => ['nullable', 'string', 'max:255'],
            'username' => ['nullable', 'string'],
            'password' => ['nullable', 'string'],
            'api_key' => ['nullable', 'string'],
            'api_secret' => ['nullable', 'string'],
            'base_url' => ['nullable', 'url'],
            'settings' => ['nullable', 'array'],
            'is_active' => ['boolean'],
        ]);
    }

    private function secretFields(): array
    {
        return ['password', 'api_key', 'api_secret'];
    }
}
