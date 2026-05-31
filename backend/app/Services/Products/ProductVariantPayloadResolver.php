<?php

namespace App\Services\Products;

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

        return Arr::wrap($this->value($product, $field));
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
