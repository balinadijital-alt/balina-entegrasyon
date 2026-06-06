<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Services\Audit\AuditLogger;
use App\Services\Marketplaces\MarketplacePublishService;
use App\Services\Products\ProductReadinessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductMarketplaceController extends Controller
{
    public function readiness(Product $product, ProductReadinessService $service): JsonResponse
    {
        $this->abortIfNotTenant(request(), $product);

        return response()->json($service->check($product));
    }

    public function drafts(Request $request): JsonResponse
    {
        $drafts = MarketplacePublishDraft::query()
            ->with(['company:id,name', 'marketplaceAccount:id,name,code'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('marketplace_code'), fn ($query) => $query->where('marketplace_code', $request->string('marketplace_code')))
            ->latest()
            ->paginate(20);

        return response()->json($drafts);
    }

    public function validatePublish(Request $request, MarketplacePublishService $service): JsonResponse
    {
        $data = $request->validate([
            'marketplace_account_id' => ['required', 'exists:marketplace_accounts,id'],
            'product_ids' => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
            'mappings' => ['nullable', 'array'],
            'price_controls' => ['nullable', 'array'],
        ]);

        $marketplace = MarketplaceAccount::findOrFail($data['marketplace_account_id']);
        $this->abortIfNotTenant($request, $marketplace);
        $draft = $service->createDraft(
            $marketplace,
            $data['product_ids'],
            $data,
            $request->user()?->id
        );

        return response()->json($draft->load(['company:id,name', 'marketplaceAccount:id,name,code']), 201);
    }

    public function send(MarketplacePublishDraft $draft, MarketplacePublishService $service, AuditLogger $audit): JsonResponse
    {
        $this->abortIfNotTenant(request(), $draft);

        $sent = $service->send($draft);
        $audit->logAction(request(), 'marketplace', 'products.send', $draft, [
            'marketplace_code' => $draft->marketplace_code,
            'marketplace_account_id' => $draft->marketplace_account_id,
            'draft_id' => $draft->id,
            'status' => $sent->status,
        ]);

        return response()->json($sent->load(['company:id,name', 'marketplaceAccount:id,name,code']));
    }
}
