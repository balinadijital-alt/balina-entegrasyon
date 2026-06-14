<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\MarketplaceCatalogCacheService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketplaceCatalogController extends Controller
{
    public function __construct(private readonly MarketplaceCatalogCacheService $catalog)
    {
    }

    public function categories(Request $request, string $marketplace): JsonResponse
    {
        $this->authorizeRead($request);

        return response()->json([
            'data' => $this->catalog->cachedCategories($marketplace, $request->query('search'))->values(),
        ]);
    }

    public function syncCategories(Request $request, string $marketplace): JsonResponse
    {
        $account = $this->syncAccount($request, $marketplace);

        return response()->json([
            'data' => $this->catalog->syncTrendyolCategories($account)->values(),
        ]);
    }

    public function brands(Request $request, string $marketplace): JsonResponse
    {
        $this->authorizeRead($request);

        return response()->json([
            'data' => $this->catalog->cachedBrands($marketplace, $request->query('search'))->values(),
        ]);
    }

    public function syncBrands(Request $request, string $marketplace): JsonResponse
    {
        $account = $this->syncAccount($request, $marketplace);

        return response()->json([
            'data' => $this->catalog->syncTrendyolBrands($account)->values(),
        ]);
    }

    public function attributes(Request $request, string $marketplace, string $categoryId): JsonResponse
    {
        $this->authorizeRead($request);

        return response()->json([
            'data' => $this->catalog->cachedAttributes($marketplace, $categoryId)->values(),
        ]);
    }

    public function syncAttributes(Request $request, string $marketplace, string $categoryId): JsonResponse
    {
        $account = $this->syncAccount($request, $marketplace);

        return response()->json([
            'data' => $this->catalog->syncTrendyolCategoryAttributes($account, $categoryId)->values(),
        ]);
    }

    public function attributeValues(Request $request, string $marketplace, string $categoryId, string $attributeId): JsonResponse
    {
        $this->authorizeRead($request);

        return response()->json([
            'data' => $this->catalog->cachedAttributeValues($marketplace, $categoryId, $attributeId)->values(),
        ]);
    }

    public function syncAttributeValues(Request $request, string $marketplace, string $categoryId, string $attributeId): JsonResponse
    {
        $account = $this->syncAccount($request, $marketplace);

        return response()->json([
            'data' => $this->catalog->syncTrendyolAttributeValues($account, $categoryId, $attributeId)->values(),
        ]);
    }

    private function syncAccount(Request $request, string $marketplace): MarketplaceAccount
    {
        $this->authorizeManage($request);
        abort_unless($marketplace === 'trendyol', 422, 'Bu sprintte yalnizca Trendyol katalog cache sync desteklenir.');

        $data = $request->validate([
            'marketplace_account_id' => ['required', 'integer', 'exists:marketplace_accounts,id'],
        ]);
        $account = MarketplaceAccount::query()->findOrFail($data['marketplace_account_id']);

        abort_unless($account->code === $marketplace, 422, 'Pazaryeri hesabi endpoint ile uyumlu degil.');
        abort_unless((int) $account->company_id === (int) $request->user()?->company_id, 403);

        return $account;
    }

    private function authorizeRead(Request $request): void
    {
        $user = $request->user();

        abort_unless($user?->can('marketplaces.manage') || $user?->can('marketplaces.send'), 403);
    }

    private function authorizeManage(Request $request): void
    {
        abort_unless($request->user()?->can('marketplaces.manage'), 403);
    }
}
