<?php

namespace App\Services\Products;

use App\Models\CategoryMapping;
use App\Models\Product;

class ProductReadinessService
{
    private const MARKETPLACES = ['trendyol', 'hepsiburada'];

    public function check(Product $product, ?string $marketplace = null): array
    {
        $product->loadMissing('images');
        $marketplaces = $marketplace ? [$marketplace] : self::MARKETPLACES;
        $reports = [];

        foreach ($marketplaces as $code) {
            $reports[$code] = $this->marketplaceReport($product, $code);

            $product->marketplaceStatuses()->updateOrCreate(
                ['marketplace_code' => $code],
                [
                    'readiness_status' => $reports[$code]['ready'] ? 'ready' : 'not_ready',
                    'missing_fields' => $reports[$code]['missing_fields'],
                    'last_checked_at' => now(),
                ]
            );
        }

        $ready = collect($reports)->every(fn (array $report) => $report['ready']);
        $product->forceFill([
            'marketplace_readiness' => $reports,
            'marketplace_ready' => $ready,
        ])->save();

        return [
            'ready' => $ready,
            'score' => (int) round(collect($reports)->avg('score') ?? 0),
            'marketplaces' => $reports,
        ];
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
            $checks['required_attributes'] = count($resolver->marketplaceAttributes($product, 'trendyol')) > 0;
        }

        if ($marketplace === 'hepsiburada') {
            $checks['marketplace_category'] = filled($resolver->value($product, 'hepsiburada_category_id'));
            $checks['category_mapping'] = $this->hasCategoryMapping($product, $marketplace, $resolver);
            $checks['required_attributes'] = count($resolver->marketplaceAttributes($product, 'hepsiburada')) > 0;
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

        return CategoryMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('local_category', $category)
            ->exists();
    }
}
