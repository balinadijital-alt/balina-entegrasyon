<?php

namespace App\Services\Products;

use App\Models\MarketplaceAttributeMapping;
use App\Models\MarketplaceVariantAttributeMapping;
use App\Models\Product;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Storage;

class ProductVariantPayloadResolver
{
    public function isVariantChild(Product $product): bool
    {
        return $product->product_type === 'variant' || $product->parent_product_id !== null;
    }

    public function variantGroupId(Product $product): string
    {
        if (! $this->isVariantChild($product)) {
            return (string) $product->sku;
        }

        $product->loadMissing('parent');

        return (string) ($product->variant_group_key ?: $product->parent?->sku ?: $product->sku);
    }

    public function value(Product $product, string $field): mixed
    {
        $value = $product->{$field};

        if (! $this->isVariantChild($product) || $this->hasValue($value)) {
            return $value;
        }

        $product->loadMissing('parent');

        return $product->parent?->{$field};
    }

    public function images(Product $product): array
    {
        $product->loadMissing('images');
        $images = $this->productImages($product);

        if ($images !== [] || ! $this->isVariantChild($product)) {
            return $images;
        }

        $product->loadMissing('parent.images');

        return $product->parent ? $this->productImages($product->parent) : [];
    }

    public function marketplaceAttributes(Product $product, ?string $marketplace = null): array
    {
        $field = match ($marketplace) {
            'trendyol' => 'trendyol_attributes',
            'hepsiburada' => 'hepsiburada_attributes',
            default => 'attributes',
        };

        $stored = $this->storedMarketplaceAttributes($this->value($product, $field));

        if (! $marketplace) {
            return $stored->all();
        }

        return $stored
            ->merge($this->mappedAttributes($product, $marketplace))
            ->unique(fn (array $attribute) => (string) ($attribute['attributeId'] ?? $attribute['id'] ?? $attribute['attribute_id'] ?? json_encode($attribute)))
            ->values()
            ->all();
    }

    private function mappedAttributes(Product $product, string $marketplace): array
    {
        $product->loadMissing('parent');
        $categoryId = $marketplace === 'trendyol'
            ? $this->value($product, 'trendyol_category_id')
            : $this->value($product, 'hepsiburada_category_id');

        $attributeRows = MarketplaceAttributeMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->where(fn ($query) => $query->whereNull('marketplace_category_id')->orWhere('marketplace_category_id', $categoryId))
            ->get()
            ->map(fn (MarketplaceAttributeMapping $mapping) => $this->attributePayloadFromMapping($mapping, $product))
            ->filter()
            ->values();

        $variantRows = MarketplaceVariantAttributeMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('status', 'active')
            ->get()
            ->map(fn (MarketplaceVariantAttributeMapping $mapping) => $this->variantAttributePayloadFromMapping($mapping, $product))
            ->filter()
            ->values();

        return $attributeRows->merge($variantRows)->all();
    }

    private function storedMarketplaceAttributes(mixed $attributes): \Illuminate\Support\Collection
    {
        if (! is_array($attributes)) {
            return collect();
        }

        if (! Arr::isAssoc($attributes)) {
            return collect($attributes)
                ->filter(fn ($attribute) => is_array($attribute))
                ->values();
        }

        return collect($attributes)
            ->map(fn ($value, $name) => ['name' => (string) $name, 'value' => $value])
            ->values();
    }

    private function attributePayloadFromMapping(MarketplaceAttributeMapping $mapping, Product $product): ?array
    {
        $value = match ($mapping->source_type) {
            'fixed_value' => $mapping->fixed_value,
            'variant_field' => data_get($product->variant_attributes ?? [], $mapping->source_field),
            'custom_json' => data_get($mapping->metadata ?? [], 'preview_value'),
            default => data_get($product, $mapping->source_field),
        };

        return $this->buildAttributePayload($mapping->marketplace_attribute_id, $value, $mapping->value_map ?? [], $mapping->metadata ?? []);
    }

    private function variantAttributePayloadFromMapping(MarketplaceVariantAttributeMapping $mapping, Product $product): ?array
    {
        if (! $this->isVariantChild($product)) {
            return null;
        }

        $source = $mapping->source_field ?: $mapping->variant_key;
        $value = data_get($product->variant_attributes ?? [], $source);

        return $this->buildAttributePayload($mapping->marketplace_attribute_id, $value, $mapping->value_map ?? [], $mapping->metadata ?? []);
    }

    private function buildAttributePayload(string|int|null $attributeId, mixed $value, array $valueMap = [], array $metadata = []): ?array
    {
        if (! $attributeId || ! $this->hasValue($value)) {
            return null;
        }

        $mapped = $this->mappedValue($value, $valueMap);
        $payload = ['attributeId' => (int) $attributeId];

        if (is_array($mapped)) {
            $valueId = $mapped['id'] ?? $mapped['external_id'] ?? $mapped['attributeValueId'] ?? $mapped['value_id'] ?? null;
            $valueName = $mapped['name'] ?? $mapped['value'] ?? $mapped['attributeValueName'] ?? null;
        } else {
            $valueId = is_numeric($mapped) ? $mapped : null;
            $valueName = is_numeric($mapped) ? null : $mapped;
        }

        if ($valueId !== null && $valueId !== '') {
            $payload['attributeValueId'] = (int) $valueId;
        } elseif (data_get($metadata, 'allow_custom', data_get($metadata, 'allowCustom', true))) {
            $payload['customAttributeValue'] = (string) ($valueName ?? $value);
        } else {
            return null;
        }

        return $payload;
    }

    private function mappedValue(mixed $value, array $valueMap): mixed
    {
        if ($valueMap === []) {
            return $value;
        }

        $key = (string) $value;

        return $valueMap[$key]
            ?? $valueMap[$this->normalize($key)]
            ?? collect($valueMap)->first(fn ($candidate, $mapKey) => $this->normalize((string) $mapKey) === $this->normalize($key))
            ?? $value;
    }

    private function normalize(string $value): string
    {
        return (string) str($value)
            ->lower()
            ->ascii()
            ->replaceMatches('/[^a-z0-9]+/', '')
            ->trim();
    }

    private function hasValue(mixed $value): bool
    {
        if (is_array($value)) {
            return $value !== [];
        }

        return $value !== null && $value !== '';
    }

    private function productImages(Product $product): array
    {
        $manualImages = collect(array_merge(
            [$product->main_image_url],
            is_array($product->gallery_images) ? $product->gallery_images : []
        ));

        $uploadedImages = $product->images
            ->map(fn ($image) => str_starts_with($image->path, 'http') ? $image->path : Storage::disk('public')->url($image->path));

        return $manualImages
            ->merge($uploadedImages)
            ->filter(fn ($url) => is_string($url) && str_starts_with($url, 'https://'))
            ->unique()
            ->values()
            ->all();
    }
}
