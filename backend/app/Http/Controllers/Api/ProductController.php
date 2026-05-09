<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $products = Product::query()
            ->with(['company:id,name', 'images'])
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = $request->string('search');
                $query->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('sku', 'like', "%{$search}%")
                    ->orWhere('barcode', 'like', "%{$search}%"));
            })
            ->latest()
            ->paginate(20);

        return response()->json($products);
    }

    public function store(Request $request): JsonResponse
    {
        $product = Product::create($this->validated($request));

        return response()->json($product->load('company', 'images'), 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($product->load('company', 'images'));
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $product->update($this->validated($request, $product->id));

        return response()->json($product->load('company', 'images'));
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->delete();

        return response()->json(status: 204);
    }

    private function validated(Request $request, ?int $productId = null): array
    {
        return $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'sku' => ['required', 'string', 'max:128'],
            'barcode' => ['nullable', 'string', 'max:128'],
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'brand' => ['nullable', 'string', 'max:128'],
            'trendyol_brand_id' => ['nullable', 'integer', 'min:1'],
            'category' => ['nullable', 'string', 'max:128'],
            'trendyol_category_id' => ['nullable', 'integer', 'min:1'],
            'price' => ['required', 'numeric', 'min:0'],
            'list_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['required', 'integer', 'min:0'],
            'vat_rate' => ['required', 'integer', 'min:0', 'max:100'],
            'dimensional_weight' => ['nullable', 'numeric', 'min:0.01'],
            'trendyol_attributes' => ['nullable', 'array'],
            'status' => ['required', 'in:draft,active,passive'],
        ]);
    }
}
