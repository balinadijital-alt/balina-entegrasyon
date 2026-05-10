<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Products\ProductReadinessService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $products = Product::query()
            ->with(['company:id,name', 'images', 'marketplaceStatuses'])
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

    public function store(Request $request, ProductReadinessService $readiness): JsonResponse
    {
        $product = Product::create($this->validated($request));
        $readiness->check($product);

        return response()->json($product->load('company', 'images', 'marketplaceStatuses'), 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json($product->load('company', 'images', 'marketplaceStatuses'));
    }

    public function update(Request $request, Product $product, ProductReadinessService $readiness): JsonResponse
    {
        $product->update($this->validated($request, $product->id));
        $readiness->check($product);

        return response()->json($product->load('company', 'images', 'marketplaceStatuses'));
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
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'sku' => ['required', 'string', 'max:128'],
            'barcode' => ['nullable', 'string', 'max:128'],
            'name' => ['required', 'string', 'max:255'],
            'product_type' => ['nullable', 'in:standard,variant,digital,square_meter'],
            'short_description' => ['nullable', 'string'],
            'description' => ['nullable', 'string'],
            'seo_title' => ['nullable', 'string', 'max:255'],
            'seo_description' => ['nullable', 'string'],
            'brand' => ['nullable', 'string', 'max:128'],
            'trendyol_brand_id' => ['nullable', 'integer', 'min:1'],
            'category' => ['nullable', 'string', 'max:128'],
            'trendyol_category_id' => ['nullable', 'integer', 'min:1'],
            'hepsiburada_category_id' => ['nullable', 'string', 'max:128'],
            'purchase_price' => ['nullable', 'numeric', 'min:0'],
            'price' => ['required', 'numeric', 'min:0'],
            'list_price' => ['nullable', 'numeric', 'min:0'],
            'stock' => ['required', 'integer', 'min:0'],
            'critical_stock' => ['nullable', 'integer', 'min:0'],
            'vat_rate' => ['required', 'integer', 'min:0', 'max:100'],
            'dimensional_weight' => ['nullable', 'numeric', 'min:0.01'],
            'weight' => ['nullable', 'numeric', 'min:0'],
            'shipping_type' => ['nullable', 'string', 'max:128'],
            'main_image_url' => ['nullable', 'url', 'max:2000'],
            'gallery_images' => ['nullable', 'array'],
            'gallery_images.*' => ['nullable', 'url', 'max:2000'],
            'video_url' => ['nullable', 'url', 'max:2000'],
            'variant_group' => ['nullable', 'string', 'max:255'],
            'variant_options' => ['nullable', 'array'],
            'trendyol_attributes' => ['nullable', 'array'],
            'hepsiburada_attributes' => ['nullable', 'array'],
            'status' => ['required', 'in:draft,active,passive'],
        ]);
    }
}
