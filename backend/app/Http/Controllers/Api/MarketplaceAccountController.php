<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Services\Audit\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketplaceAccountController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $accounts = MarketplaceAccount::query()
            ->with('company:id,name')
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->latest()
            ->paginate(20);

        $accounts->getCollection()->transform(fn (MarketplaceAccount $account) => $this->maskSecrets($account));

        return response()->json($accounts);
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $payload = $this->validated($request);
        $account = MarketplaceAccount::query()
            ->where('company_id', $payload['company_id'])
            ->where('code', $payload['code'])
            ->first();

        if ($account) {
            $old = $account->fresh()->makeVisible($this->secretFields())->toArray();
            $account->update($audit->preserveBlankSecrets($account, $payload, $this->secretFields()));
            $audit->logAction($request, 'credentials', 'marketplace_account.update', $account, ['marketplace_code' => $account->code], $old, $account->fresh()->makeVisible($this->secretFields())->toArray());

            return response()->json($this->maskSecrets($account->load('company')));
        }

        $account = MarketplaceAccount::create($payload);
        $audit->logAction($request, 'credentials', 'marketplace_account.create', $account, ['marketplace_code' => $account->code], null, $account->toArray());

        return response()->json($this->maskSecrets($account->load('company')), 201);
    }

    public function show(MarketplaceAccount $marketplace): JsonResponse
    {
        $this->abortIfNotTenant(request(), $marketplace);

        return response()->json($this->maskSecrets($marketplace->load('company')));
    }

    public function update(Request $request, MarketplaceAccount $marketplace, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant($request, $marketplace);

        $old = $marketplace->fresh()->makeVisible($this->secretFields())->toArray();
        $payload = $audit->preserveBlankSecrets($marketplace, $this->validated($request), $this->secretFields());
        $marketplace->update($payload);
        $audit->logAction($request, 'credentials', 'marketplace_account.update', $marketplace, ['marketplace_code' => $marketplace->code], $old, $marketplace->fresh()->makeVisible($this->secretFields())->toArray());

        return response()->json($this->maskSecrets($marketplace->load('company')));
    }

    public function destroy(MarketplaceAccount $marketplace, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant(request(), $marketplace);

        $old = $marketplace->fresh()->makeVisible($this->secretFields())->toArray();
        $marketplace->delete();
        $audit->logAction(request(), 'credentials', 'marketplace_account.delete', $marketplace, ['marketplace_code' => $marketplace->code], $old);

        return response()->json(status: 204);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'code' => ['required', 'in:trendyol,hepsiburada,ciceksepeti'],
            'name' => ['required', 'string', 'max:255'],
            'supplier_id' => ['nullable', 'string', 'max:255'],
            'merchant_id' => ['nullable', 'string', 'max:255'],
            'api_key' => ['nullable', 'string'],
            'api_secret' => ['nullable', 'string'],
            'service_username' => ['nullable', 'string'],
            'service_password' => ['nullable', 'string'],
            'is_active' => ['boolean'],
            'metadata' => ['nullable', 'array'],
        ]);

        $companyId = $this->tenantCompanyId($request);
        if ($companyId) {
            $data['company_id'] = $companyId;
        }

        return $data;
    }

    private function maskSecrets(MarketplaceAccount $account): MarketplaceAccount
    {
        $account->api_key = $account->api_key ? '********' : null;
        $account->api_secret = $account->api_secret ? '********' : null;

        return $account;
    }

    private function secretFields(): array
    {
        return ['api_key', 'api_secret', 'service_password'];
    }
}
