<?php

namespace App\Services\Products;

use App\Models\CategoryMapping;
use App\Models\MarketplaceAttributeMapping;
use App\Models\MarketplaceCatalogAttribute;
use App\Models\MarketplaceCatalogAttributeValue;
use App\Models\MarketplaceBrandMapping;
use App\Models\MarketplaceCategoryMapping;
use App\Models\MarketplaceVariantAttributeMapping;
use App\Models\Product;
use Illuminate\Support\Collection;

class ProductReadinessService
{
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];

    public function check(Product $product, ?string $marketplace = null): array
    {
        $product->loadMissing('images');
        $marketplaces = $marketplace ? [$marketplace] : self::MARKETPLACES;
        $reports = [];
        $isParent = $product->product_type === 'parent';

        foreach ($marketplaces as $code) {
            $reports[$code] = $this->marketplaceReport($product, $code);

            if (! $isParent) {
                $product->marketplaceStatuses()->updateOrCreate(
                    ['marketplace_code' => $code, 'marketplace_account_id' => null],
                    [
                        'readiness_status' => $reports[$code]['ready'] ? 'ready' : 'not_ready',
                        'missing_fields' => $reports[$code]['missing_fields'],
                        'last_checked_at' => now(),
                    ]
                );
            }
        }

        $ready = collect($reports)->every(fn (array $report) => $report['ready']);
        $product->forceFill([
            'marketplace_readiness' => $reports,
            'marketplace_ready' => $ready,
        ])->save();

        $response = [
            'ready' => $ready,
            'score' => (int) round(collect($reports)->avg('score') ?? 0),
            'marketplaces' => $reports,
        ];

        if ($isParent) {
            $rollup = new ProductVariantRollupService();
            $response['variant_readiness_rollup'] = $rollup->readiness($product);
            $response['variant_marketplace_status_rollup'] = $rollup->marketplaceStatuses($product);
        }

        return $response;
    }

    private function marketplaceReport(Product $product, string $marketplace): array
    {
        if ($product->product_type === 'parent') {
            return [
                'marketplace' => $marketplace,
                'ready' => false,
                'score' => 0,
                'missing_fields' => ['provider_candidate'],
                'checks' => ['provider_candidate' => false],
                'checked_at' => now()->toISOString(),
            ];
        }

        $resolver = new ProductVariantPayloadResolver();

        $checks = [
            'name' => filled($resolver->value($product, 'name')),
            'brand' => filled($resolver->value($product, 'brand')),
            'category' => filled($resolver->value($product, 'category')),
            'barcode' => filled($product->barcode),
            'sku' => filled($product->sku),
            'price' => (float) $product->price > 0,
            'stock' => $product->stock !== null && (int) $product->stock >= 0,
            'attributes' => count($resolver->marketplaceAttributes($product)) > 0,
            'vat_rate' => $resolver->value($product, 'vat_rate') !== null,
            'description' => filled($resolver->value($product, 'description')) || filled($resolver->value($product, 'short_description')),
            'seo' => filled($resolver->value($product, 'seo_title')) && filled($resolver->value($product, 'seo_description')),
            'image' => $this->hasImage($product, $resolver),
            'cargo' => filled($resolver->value($product, 'shipping_type')) || (float) $resolver->value($product, 'dimensional_weight') > 0 || (float) $resolver->value($product, 'weight') > 0,
        ];

        if ($marketplace === 'trendyol') {
            $checks['marketplace_category'] = filled($resolver->value($product, 'trendyol_category_id'));
            $checks['category_mapping'] = $this->hasCategoryMapping($product, $marketplace, $resolver);
            $checks['required_attributes'] = $this->hasRequiredCatalogAttributes($product, $resolver);
            $this->appendMappingCenterChecks($checks, $product, $marketplace);
        }

        if ($marketplace === 'hepsiburada') {
            $checks['marketplace_category'] = filled($resolver->value($product, 'hepsiburada_category_id'));
            $checks['category_mapping'] = $this->hasCategoryMapping($product, $marketplace, $resolver);
            $checks['required_attributes'] = count($resolver->marketplaceAttributes($product, 'hepsiburada')) > 0;
            $this->appendMappingCenterChecks($checks, $product, $marketplace);
        }

        $missing = collect($checks)
            ->filter(fn (bool $passed) => ! $passed)
            ->keys()
            ->values()
            ->all();

        $passed = count($checks) - count($missing);

        return [
            'marketplace' => $marketplace,
            'ready' => count($missing) === 0,
            'score' => (int) round(($passed / max(count($checks), 1)) * 100),
            'missing_fields' => $missing,
            'checks' => $checks,
            'checked_at' => now()->toISOString(),
        ];
    }

    private function hasImage(Product $product, ProductVariantPayloadResolver $resolver): bool
    {
        return $resolver->images($product) !== [];
    }

    private function hasCategoryMapping(Product $product, string $marketplace, ProductVariantPayloadResolver $resolver): bool
    {
        $category = $resolver->value($product, 'category');

        if (! filled($category)) {
            return false;
        }

        $mappingCenterMatch = MarketplaceCategoryMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->where('local_category_name', $category)
            ->exists();

        if ($mappingCenterMatch) {
            return true;
        }

        return CategoryMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('local_category', $category)
            ->exists();
    }

    private function appendMappingCenterChecks(array &$checks, Product $product, string $marketplace): void
    {
        $checks['brand_mapping'] = $this->hasBrandMapping($product, $marketplace);
        $checks['attribute_mappings'] = $this->hasRequiredAttributeMappings($product, $marketplace);

        if ($product->product_type === 'variant' || $product->parent_product_id) {
            $checks['variant_attribute_mappings'] = $this->hasVariantAttributeMappings($product, $marketplace);
        }
    }

    private function hasBrandMapping(Product $product, string $marketplace): bool
    {
        $hasConfiguredMappings = MarketplaceBrandMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->exists();

        if (! $hasConfiguredMappings) {
            return true;
        }

        if (! filled($product->brand)) {
            return false;
        }

        return MarketplaceBrandMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->where('local_brand_name', $product->brand)
            ->exists();
    }

    private function hasRequiredAttributeMappings(Product $product, string $marketplace): bool
    {
        if ($marketplace === 'trendyol') {
            return $this->hasRequiredCatalogAttributes($product, new ProductVariantPayloadResolver());
        }

        $categoryId = $marketplace === 'trendyol' ? $product->trendyol_category_id : $product->hepsiburada_category_id;
        $mappings = MarketplaceAttributeMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->where('required', true)
            ->where(fn ($query) => $query->whereNull('marketplace_category_id')->orWhere('marketplace_category_id', $categoryId))
            ->get();

        if ($mappings->isEmpty()) {
            return true;
        }

        return $mappings->every(fn (MarketplaceAttributeMapping $mapping) => $this->mappingHasValue($mapping, $product));
    }

    private function hasVariantAttributeMappings(Product $product, string $marketplace): bool
    {
        $mappings = MarketplaceVariantAttributeMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->get();

        if ($mappings->isEmpty()) {
            return true;
        }

        return $mappings->every(fn (MarketplaceVariantAttributeMapping $mapping) => $this->variantMappingHasValue($mapping, $product));
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

    private function variantMappingHasValue(MarketplaceVariantAttributeMapping $mapping, Product $product): bool
    {
        $source = $mapping->source_field ?: $mapping->variant_key;

        return filled(data_get($product->variant_attributes ?? [], $source));
    }

    private function hasRequiredCatalogAttributes(Product $product, ProductVariantPayloadResolver $resolver): bool
    {
        $categoryId = $resolver->value($product, 'trendyol_category_id');

        if (! filled($categoryId)) {
            return false;
        }

        $requiredAttributes = MarketplaceCatalogAttribute::query()
            ->where('marketplace_code', 'trendyol')
            ->where('category_external_id', (string) $categoryId)
            ->where('required', true)
            ->get();

        if ($requiredAttributes->isEmpty()) {
            return count($resolver->marketplaceAttributes($product, 'trendyol')) > 0;
        }

        $payloadAttributes = collect($resolver->marketplaceAttributes($product, 'trendyol'));

        return $requiredAttributes->every(function (MarketplaceCatalogAttribute $attribute) use ($product, $payloadAttributes) {
            $payloadAttribute = $this->payloadAttributeFor($payloadAttributes, $attribute);

            if (! $this->payloadAttributeHasValidValue($payloadAttribute, $attribute)) {
                return false;
            }

            if ($this->isVariantAttribute($attribute) && ($product->product_type === 'variant' || $product->parent_product_id)) {
                return $this->hasVariantMappingForAttribute($product, $attribute);
            }

            return true;
        });
    }

    private function payloadAttributeFor(Collection $payloadAttributes, MarketplaceCatalogAttribute $attribute): ?array
    {
        return $payloadAttributes->first(function (array $payloadAttribute) use ($attribute) {
            $payloadId = data_get($payloadAttribute, 'attributeId')
                ?? data_get($payloadAttribute, 'attribute_id')
                ?? data_get($payloadAttribute, 'id');

            return (string) $payloadId === (string) $attribute->external_id;
        });
    }

    private function payloadAttributeHasValidValue(?array $payloadAttribute, MarketplaceCatalogAttribute $attribute): bool
    {
        if (! $payloadAttribute) {
            return false;
        }

        $valueId = data_get($payloadAttribute, 'attributeValueId')
            ?? data_get($payloadAttribute, 'valueId')
            ?? data_get($payloadAttribute, 'attribute_value_id');
        $customValue = data_get($payloadAttribute, 'customAttributeValue')
            ?? data_get($payloadAttribute, 'value')
            ?? data_get($payloadAttribute, 'name');

        $allowedValues = MarketplaceCatalogAttributeValue::query()
            ->where('marketplace_code', 'trendyol')
            ->where('category_external_id', (string) $attribute->category_external_id)
            ->where('attribute_external_id', (string) $attribute->external_id)
            ->pluck('external_id')
            ->map(fn ($id) => (string) $id);

        if ($allowedValues->isNotEmpty()) {
            return filled($valueId) && $allowedValues->contains((string) $valueId);
        }

        if ($attribute->allow_custom) {
            return filled($customValue) || filled($valueId);
        }

        return filled($valueId);
    }

    private function isVariantAttribute(MarketplaceCatalogAttribute $attribute): bool
    {
        $name = str((string) $attribute->name)->lower()->ascii()->toString();

        return str_contains($name, 'renk')
            || str_contains($name, 'color')
            || str_contains($name, 'beden')
            || str_contains($name, 'size')
            || str_contains($name, 'boyut')
            || str_contains($name, 'ebat')
            || str_contains($name, 'numara');
    }

    private function hasVariantMappingForAttribute(Product $product, MarketplaceCatalogAttribute $attribute): bool
    {
        $mapping = MarketplaceVariantAttributeMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', 'trendyol')
            ->where('status', 'active')
            ->where('marketplace_attribute_id', (string) $attribute->external_id)
            ->first();

        return $mapping ? $this->variantMappingHasValue($mapping, $product) : false;
    }
}
