<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CategoryMapping;
use App\Models\MarketplaceAttributeMapping;
use App\Models\MarketplaceBrandMapping;
use App\Models\MarketplaceCategoryMapping;
use App\Models\MarketplaceVariantAttributeMapping;
use App\Models\Product;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;

class MarketplaceMappingController extends Controller
{
    private const PRODUCT_PREVIEW_LIMIT = 300;
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];
    private const SOURCE_TYPES = ['product_field', 'variant_field', 'fixed_value', 'custom_json'];

    public function summary(Request $request): JsonResponse
    {
        $marketplace = $this->marketplace($request);
        $products = $this->productScope($request)->limit(self::PRODUCT_PREVIEW_LIMIT)->get();

        $categoryNames = $products->pluck('category')->filter()->unique()->values();
        $brandNames = $products->pluck('brand')->filter()->unique()->values();

        $mappedCategories = $this->mappedCategories($request, $marketplace);
        $legacyMappedCategories = $this->legacyMappedCategories($request, $marketplace);
        $mappedBrands = $this->mappedBrands($request, $marketplace);
        $requiredAttributeCount = $this->mappingScope(MarketplaceAttributeMapping::query(), $request, $marketplace)
            ->where('status', 'active')
            ->where('required', true)
            ->count();
        $preview = $this->previewRows($request, $marketplace, $products);

        return response()->json([
            'marketplace_code' => $marketplace,
            'unmapped_category_count' => $categoryNames
                ->reject(fn ($category) => $mappedCategories->contains($category) || $legacyMappedCategories->contains($category))
                ->count(),
            'unmapped_brand_count' => $brandNames->reject(fn ($brand) => $mappedBrands->contains($brand))->count(),
            'missing_required_attribute_count' => collect($preview)->sum(fn (array $row) => count($row['missing_required_attributes'])),
            'missing_variant_attribute_count' => collect($preview)->sum(fn (array $row) => count($row['missing_variant_attributes'])),
            'ready_product_count' => collect($preview)->where('readiness_status', 'ready')->count(),
            'blocked_product_count' => collect($preview)->where('readiness_status', 'blocked')->count(),
            'category_mapping_count' => $this->mappingScope(MarketplaceCategoryMapping::query(), $request, $marketplace)->count(),
            'brand_mapping_count' => $this->mappingScope(MarketplaceBrandMapping::query(), $request, $marketplace)->count(),
            'attribute_mapping_count' => $this->mappingScope(MarketplaceAttributeMapping::query(), $request, $marketplace)->count(),
            'variant_mapping_count' => $this->mappingScope(MarketplaceVariantAttributeMapping::query(), $request, $marketplace)->count(),
            'sampled_product_count' => $products->count(),
        ]);
    }

    public function readinessPreview(Request $request): JsonResponse
    {
        $marketplace = $this->marketplace($request);
        $products = $this->productScope($request)->limit(self::PRODUCT_PREVIEW_LIMIT)->get();

        return response()->json([
            'data' => $this->previewRows($request, $marketplace, $products),
            'sampled_product_count' => $products->count(),
        ]);
    }

    public function categories(Request $request): JsonResponse
    {
        return response()->json($this->mappingScope(MarketplaceCategoryMapping::query(), $request)
            ->latest()
            ->paginate(50));
    }

    public function storeCategory(Request $request): JsonResponse
    {
        $data = $this->categoryData($request);
        $mapping = MarketplaceCategoryMapping::updateOrCreate(
            $this->categoryIdentity($data),
            $this->withActor($request, $data, true)
        );

        return response()->json($mapping, 201);
    }

    public function updateCategory(Request $request, MarketplaceCategoryMapping $mapping): JsonResponse
    {
        return $this->updateMapping($request, $mapping, $this->categoryData($request));
    }

    public function destroyCategory(Request $request, MarketplaceCategoryMapping $mapping): JsonResponse
    {
        return $this->destroyMapping($request, $mapping);
    }

    public function brands(Request $request): JsonResponse
    {
        return response()->json($this->mappingScope(MarketplaceBrandMapping::query(), $request)
            ->latest()
            ->paginate(50));
    }

    public function storeBrand(Request $request): JsonResponse
    {
        $data = $this->brandData($request);
        $mapping = MarketplaceBrandMapping::updateOrCreate(
            Arr::only($data, ['company_id', 'marketplace_code', 'local_brand_name']),
            $this->withActor($request, $data, true)
        );

        return response()->json($mapping, 201);
    }

    public function updateBrand(Request $request, MarketplaceBrandMapping $mapping): JsonResponse
    {
        return $this->updateMapping($request, $mapping, $this->brandData($request));
    }

    public function destroyBrand(Request $request, MarketplaceBrandMapping $mapping): JsonResponse
    {
        return $this->destroyMapping($request, $mapping);
    }

    public function attributes(Request $request): JsonResponse
    {
        return response()->json($this->mappingScope(MarketplaceAttributeMapping::query(), $request)
            ->latest()
            ->paginate(50));
    }

    public function storeAttribute(Request $request): JsonResponse
    {
        $data = $this->attributeData($request);
        $mapping = MarketplaceAttributeMapping::updateOrCreate(
            Arr::only($data, ['company_id', 'marketplace_code', 'marketplace_category_id', 'marketplace_attribute_id']),
            $this->withActor($request, $data, true)
        );

        return response()->json($mapping, 201);
    }

    public function updateAttribute(Request $request, MarketplaceAttributeMapping $mapping): JsonResponse
    {
        return $this->updateMapping($request, $mapping, $this->attributeData($request));
    }

    public function destroyAttribute(Request $request, MarketplaceAttributeMapping $mapping): JsonResponse
    {
        return $this->destroyMapping($request, $mapping);
    }

    public function variants(Request $request): JsonResponse
    {
        return response()->json($this->mappingScope(MarketplaceVariantAttributeMapping::query(), $request)
            ->latest()
            ->paginate(50));
    }

    public function storeVariant(Request $request): JsonResponse
    {
        $data = $this->variantData($request);
        $mapping = MarketplaceVariantAttributeMapping::updateOrCreate(
            Arr::only($data, ['company_id', 'marketplace_code', 'variant_key', 'marketplace_attribute_id']),
            $this->withActor($request, $data, true)
        );

        return response()->json($mapping, 201);
    }

    public function updateVariant(Request $request, MarketplaceVariantAttributeMapping $mapping): JsonResponse
    {
        return $this->updateMapping($request, $mapping, $this->variantData($request));
    }

    public function destroyVariant(Request $request, MarketplaceVariantAttributeMapping $mapping): JsonResponse
    {
        return $this->destroyMapping($request, $mapping);
    }

    private function updateMapping(Request $request, Model $mapping, array $data): JsonResponse
    {
        $this->abortIfNotTenant($request, $mapping);
        $mapping->update($this->withActor($request, $data));

        return response()->json($mapping->refresh());
    }

    private function destroyMapping(Request $request, Model $mapping): JsonResponse
    {
        $this->abortIfNotTenant($request, $mapping);
        $mapping->delete();

        return response()->json(status: 204);
    }

    private function categoryData(Request $request): array
    {
        return $this->forceTenantCompany($request, $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'marketplace_code' => ['required', 'in:trendyol,hepsiburada'],
            'local_category_id' => ['nullable', 'integer', 'min:1'],
            'local_category_name' => ['nullable', 'string', 'max:255'],
            'marketplace_category_id' => ['required', 'string', 'max:255'],
            'marketplace_category_name' => ['required', 'string', 'max:255'],
            'marketplace_category_path' => ['nullable', 'string', 'max:255'],
            'confidence' => ['nullable', 'string', 'max:40'],
            'status' => ['nullable', 'string', 'max:40'],
            'metadata' => ['nullable', 'array'],
        ]));
    }

    private function brandData(Request $request): array
    {
        return $this->forceTenantCompany($request, $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'marketplace_code' => ['required', 'in:trendyol,hepsiburada'],
            'local_brand_id' => ['nullable', 'integer', 'min:1'],
            'local_brand_name' => ['required', 'string', 'max:255'],
            'marketplace_brand_id' => ['nullable', 'string', 'max:255'],
            'marketplace_brand_name' => ['required', 'string', 'max:255'],
            'confidence' => ['nullable', 'string', 'max:40'],
            'status' => ['nullable', 'string', 'max:40'],
            'metadata' => ['nullable', 'array'],
        ]));
    }

    private function attributeData(Request $request): array
    {
        return $this->forceTenantCompany($request, $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'marketplace_code' => ['required', 'in:trendyol,hepsiburada'],
            'local_category_id' => ['nullable', 'integer', 'min:1'],
            'marketplace_category_id' => ['nullable', 'string', 'max:255'],
            'marketplace_attribute_id' => ['required', 'string', 'max:255'],
            'marketplace_attribute_name' => ['required', 'string', 'max:255'],
            'required' => ['nullable', 'boolean'],
            'value_type' => ['nullable', 'string', 'max:80'],
            'source_type' => ['required', 'in:'.implode(',', self::SOURCE_TYPES)],
            'source_field' => ['nullable', 'string', 'max:255'],
            'fixed_value' => ['nullable', 'string'],
            'value_map' => ['nullable', 'array'],
            'status' => ['nullable', 'string', 'max:40'],
            'metadata' => ['nullable', 'array'],
        ]));
    }

    private function variantData(Request $request): array
    {
        return $this->forceTenantCompany($request, $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'marketplace_code' => ['required', 'in:trendyol,hepsiburada'],
            'variant_key' => ['required', 'string', 'max:255'],
            'marketplace_attribute_id' => ['required', 'string', 'max:255'],
            'marketplace_attribute_name' => ['required', 'string', 'max:255'],
            'source_type' => ['nullable', 'in:'.implode(',', self::SOURCE_TYPES)],
            'source_field' => ['nullable', 'string', 'max:255'],
            'value_map' => ['nullable', 'array'],
            'status' => ['nullable', 'string', 'max:40'],
            'metadata' => ['nullable', 'array'],
        ]));
    }

    private function categoryIdentity(array $data): array
    {
        $identity = Arr::only($data, ['company_id', 'marketplace_code']);
        if (! empty($data['local_category_id'])) {
            $identity['local_category_id'] = $data['local_category_id'];
        } else {
            $identity['local_category_name'] = $data['local_category_name'];
        }

        return $identity;
    }

    private function withActor(Request $request, array $data, bool $create = false): array
    {
        $data['updated_by'] = $request->user()?->id;
        $data['status'] ??= 'active';

        if ($create) {
            $data['created_by'] = $request->user()?->id;
        }

        return $data;
    }

    private function mappingScope(Builder $query, Request $request, ?string $marketplace = null): Builder
    {
        return $query
            ->when($this->tenantCompanyId($request), fn ($inner, $companyId) => $inner->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($inner) => $inner->where('company_id', $request->integer('company_id')))
            ->when($marketplace || $request->filled('marketplace_code'), function ($inner) use ($request, $marketplace) {
                $inner->where('marketplace_code', $marketplace ?: $request->query('marketplace_code'));
            })
            ->when($request->filled('status'), fn ($inner) => $inner->where('status', $request->string('status')));
    }

    private function productScope(Request $request): Builder
    {
        return Product::query()
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->where(fn ($query) => $query->whereNull('product_type')->orWhere('product_type', '!=', 'parent'))
            ->latest();
    }

    private function marketplace(Request $request): string
    {
        $request->validate(['marketplace_code' => ['nullable', 'in:trendyol,hepsiburada']]);

        return $request->query('marketplace_code', 'trendyol');
    }

    private function previewRows(Request $request, string $marketplace, $products): array
    {
        $mappedCategories = $this->mappedCategories($request, $marketplace);
        $legacyMappedCategories = $this->legacyMappedCategories($request, $marketplace);
        $mappedBrands = $this->mappedBrands($request, $marketplace);
        $attributeMappings = $this->mappingScope(MarketplaceAttributeMapping::query(), $request, $marketplace)
            ->where('status', 'active')
            ->where('required', true)
            ->get();
        $variantMappings = $this->mappingScope(MarketplaceVariantAttributeMapping::query(), $request, $marketplace)
            ->where('status', 'active')
            ->get();

        return $products->map(function (Product $product) use ($marketplace, $mappedCategories, $legacyMappedCategories, $mappedBrands, $attributeMappings, $variantMappings) {
            $missingAttributes = $attributeMappings
                ->filter(fn (MarketplaceAttributeMapping $mapping) => $this->attributeAppliesToProduct($mapping, $product, $marketplace))
                ->reject(fn (MarketplaceAttributeMapping $mapping) => $this->mappingHasValue($mapping, $product))
                ->pluck('marketplace_attribute_name')
                ->values()
                ->all();
            $missingVariantAttributes = $variantMappings
                ->filter(fn (MarketplaceVariantAttributeMapping $mapping) => $this->variantMappingAppliesToProduct($mapping, $product))
                ->reject(fn (MarketplaceVariantAttributeMapping $mapping) => $this->variantMappingHasValue($mapping, $product))
                ->pluck('marketplace_attribute_name')
                ->values()
                ->all();
            $missingCategory = filled($product->category) && ! $mappedCategories->contains($product->category) && ! $legacyMappedCategories->contains($product->category);
            $missingBrand = filled($product->brand) && ! $mappedBrands->contains($product->brand);
            $reasons = collect([
                $missingCategory ? 'category_mapping' : null,
                $missingBrand ? 'brand_mapping' : null,
                $missingAttributes !== [] ? 'required_attributes' : null,
                $missingVariantAttributes !== [] ? 'variant_attributes' : null,
            ])->filter()->values()->all();

            return [
                'product_id' => $product->id,
                'sku' => $product->sku,
                'name' => $product->name,
                'category' => $product->category,
                'brand' => $product->brand,
                'trendyol_category_id' => $product->trendyol_category_id,
                'hepsiburada_category_id' => $product->hepsiburada_category_id,
                'product_type' => $product->product_type,
                'variant_attributes' => $product->variant_attributes ?? [],
                'marketplace_code' => $marketplace,
                'missing_category_mapping' => $missingCategory,
                'missing_brand_mapping' => $missingBrand,
                'missing_required_attributes' => $missingAttributes,
                'missing_variant_attributes' => $missingVariantAttributes,
                'readiness_status' => $reasons === [] ? 'ready' : 'blocked',
                'reasons' => $reasons,
            ];
        })->values()->all();
    }

    private function mappedCategories(Request $request, string $marketplace)
    {
        return $this->mappingScope(MarketplaceCategoryMapping::query(), $request, $marketplace)
            ->where('status', 'active')
            ->pluck('local_category_name')
            ->filter()
            ->values();
    }

    private function legacyMappedCategories(Request $request, string $marketplace)
    {
        return CategoryMapping::query()
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->where('marketplace_code', $marketplace)
            ->pluck('local_category')
            ->filter()
            ->values();
    }

    private function mappedBrands(Request $request, string $marketplace)
    {
        return $this->mappingScope(MarketplaceBrandMapping::query(), $request, $marketplace)
            ->where('status', 'active')
            ->pluck('local_brand_name')
            ->filter()
            ->values();
    }

    private function attributeAppliesToProduct(MarketplaceAttributeMapping $mapping, Product $product, string $marketplace): bool
    {
        $categoryId = $marketplace === 'trendyol' ? $product->trendyol_category_id : $product->hepsiburada_category_id;

        return blank($mapping->marketplace_category_id) || (string) $mapping->marketplace_category_id === (string) $categoryId;
    }

    private function mappingHasValue(MarketplaceAttributeMapping $mapping, Product $product): bool
    {
        return filled(match ($mapping->source_type) {
            'fixed_value' => $mapping->fixed_value,
            'variant_field' => data_get($product->variant_attributes ?? [], $mapping->source_field),
            'custom_json' => data_get($mapping->metadata ?? [], 'preview_value'),
            default => data_get($product, $mapping->source_field),
        });
    }

    private function variantMappingAppliesToProduct(MarketplaceVariantAttributeMapping $mapping, Product $product): bool
    {
        if ($product->product_type !== 'variant' && ! $product->parent_product_id) {
            return false;
        }

        return array_key_exists($mapping->variant_key, $product->variant_attributes ?? []);
    }

    private function variantMappingHasValue(MarketplaceVariantAttributeMapping $mapping, Product $product): bool
    {
        $source = $mapping->source_field ?: $mapping->variant_key;

        return filled(data_get($product->variant_attributes ?? [], $source));
    }
}
