<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ShippingAccount;
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

    public function store(Request $request): JsonResponse
    {
        $account = ShippingAccount::create($this->forceTenantCompany($request, $this->validated($request)));

        return response()->json($account->load(['company:id,name', 'carrier:id,code,name']), 201);
    }

    public function update(Request $request, ShippingAccount $shippingAccount): JsonResponse
    {
        $this->abortIfAccountNotTenant($request, $shippingAccount);

        $shippingAccount->update($this->forceTenantCompany($request, $this->validated($request, true)));

        return response()->json($shippingAccount->load(['company:id,name', 'carrier:id,code,name']));
    }

    public function destroy(ShippingAccount $shippingAccount): JsonResponse
    {
        $this->abortIfAccountNotTenant(request(), $shippingAccount);

        $shippingAccount->delete();

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
}
