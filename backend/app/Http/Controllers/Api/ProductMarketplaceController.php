<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Models\MarketplacePublishDraft;
use App\Models\Product;
use App\Services\Marketplaces\MarketplacePublishService;
use App\Services\Products\ProductReadinessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductMarketplaceController extends Controller
{
    public function readiness(Product $product, ProductReadinessService $service): JsonResponse
    {
        return response()->json($service->check($product));
    }

    public function drafts(Request $request): JsonResponse
    {
        $drafts = MarketplacePublishDraft::query()
            ->with(['company:id,name', 'marketplaceAccount:id,name,code'])
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
        $draft = $service->createDraft(
            $marketplace,
            $data['product_ids'],
            $data,
            $request->user()?->id
        );

        return response()->json($draft->load(['company:id,name', 'marketplaceAccount:id,name,code']), 201);
    }

    public function send(MarketplacePublishDraft $draft, MarketplacePublishService $service): JsonResponse
    {
        return response()->json($service->send($draft)->load(['company:id,name', 'marketplaceAccount:id,name,code']));
    }
}
