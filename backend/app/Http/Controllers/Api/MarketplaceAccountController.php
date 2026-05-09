<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\MarketplaceAccount;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class MarketplaceAccountController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(MarketplaceAccount::with('company:id,name')->latest()->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $account = MarketplaceAccount::create($this->validated($request));

        return response()->json($account->load('company'), 201);
    }

    public function show(MarketplaceAccount $marketplace): JsonResponse
    {
        return response()->json($marketplace->load('company'));
    }

    public function update(Request $request, MarketplaceAccount $marketplace): JsonResponse
    {
        $marketplace->update($this->validated($request));

        return response()->json($marketplace->load('company'));
    }

    public function destroy(MarketplaceAccount $marketplace): JsonResponse
    {
        $marketplace->delete();

        return response()->json(status: 204);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'code' => ['required', 'in:trendyol,hepsiburada'],
            'name' => ['required', 'string', 'max:255'],
            'supplier_id' => ['nullable', 'string', 'max:255'],
            'merchant_id' => ['nullable', 'string', 'max:255'],
            'api_key' => ['nullable', 'string'],
            'api_secret' => ['nullable', 'string'],
            'is_active' => ['boolean'],
            'metadata' => ['nullable', 'array'],
        ]);
    }
}
