<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Services\Products\ProductReadinessService;
use App\Services\Products\ProductVariantRollupService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $products = Product::query()
            ->with([
                'company:id,name',
                'xmlSource:id,name',
                'parent:id,name,sku,product_type',
                'variants:id,parent_product_id,sku,name,stock,price,barcode,variant_group_key,variant_attributes,marketplace_readiness,marketplace_ready,status',
                'variants.marketplaceStatuses:id,product_id,marketplace_code,status,readiness_status,missing_fields,error_message,batch_request_id,last_sent_at,last_checked_at,updated_at,created_at',
                'images',
                'marketplaceStatuses',
            ])
            ->withCount('variants')
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
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

        $this->attachVariantRollups($products->getCollection());

        return response()->json($products);
    }

    public function store(Request $request, ProductReadinessService $readiness): JsonResponse
    {
        $product = Product::create($this->validated($request));
        $readiness->check($product);

        $product->load('company', 'parent:id,name,sku,product_type', 'variants.marketplaceStatuses', 'images', 'marketplaceStatuses');
        $this->attachVariantRollup($product);

        return response()->json($product, 201);
    }

    public function show(Product $product): JsonResponse
    {
        $this->abortIfNotTenant(request(), $product);

        $product->load('company', 'xmlSource:id,name', 'parent:id,name,sku,product_type', 'variants.marketplaceStatuses', 'images', 'marketplaceStatuses');
        $this->attachVariantRollup($product);

        return response()->json($product);
    }

    public function update(Request $request, Product $product, ProductReadinessService $readiness): JsonResponse
    {
        $this->abortIfNotTenant($request, $product);

        $product->update($this->validated($request, $product->id));
        $readiness->check($product);

        $product->load('company', 'xmlSource:id,name', 'parent:id,name,sku,product_type', 'variants.marketplaceStatuses', 'images', 'marketplaceStatuses');
        $this->attachVariantRollup($product);

        return response()->json($product);
    }

    public function destroy(Product $product): JsonResponse
    {
        $this->abortIfNotTenant(request(), $product);

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
            'product_type' => ['nullable', 'in:standard,variant,parent,digital,square_meter'],
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
            'unit' => ['nullable', 'string', 'max:64'],
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
            'tags' => ['nullable', 'array'],
            'tags.*' => ['nullable', 'string', 'max:120'],
            'attributes' => ['nullable', 'array'],
            'status' => ['required', 'in:draft,active,passive'],
        ]);
    }

    private function attachVariantRollups($products): void
    {
        $products->each(fn (Product $product) => $this->attachVariantRollup($product));
    }

    private function attachVariantRollup(Product $product): void
    {
        if ($product->product_type !== 'parent') {
            return;
        }

        $rollup = new ProductVariantRollupService();
        $product->setAttribute('variant_readiness_rollup', $rollup->readiness($product));
        $product->setAttribute('variant_marketplace_status_rollup', $rollup->marketplaceStatuses($product));
    }
}
