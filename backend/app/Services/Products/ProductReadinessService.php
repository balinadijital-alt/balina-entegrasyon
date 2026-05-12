<?php

namespace App\Services\Products;

use App\Models\CategoryMapping;
use App\Models\Product;
use Illuminate\Support\Arr;

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
        $checks = [
            'name' => filled($product->name),
            'brand' => filled($product->brand),
            'category' => filled($product->category),
            'barcode' => filled($product->barcode),
            'sku' => filled($product->sku),
            'price' => (float) $product->price > 0,
            'stock' => $product->stock !== null && (int) $product->stock >= 0,
            'vat_rate' => $product->vat_rate !== null,
            'description' => filled($product->description) || filled($product->short_description),
            'seo' => filled($product->seo_title) && filled($product->seo_description),
            'image' => $this->hasImage($product),
            'cargo' => filled($product->shipping_type) || (float) $product->dimensional_weight > 0 || (float) $product->weight > 0,
        ];

        if ($marketplace === 'trendyol') {
            $checks['marketplace_category'] = filled($product->trendyol_category_id);
            $checks['category_mapping'] = $this->hasCategoryMapping($product, $marketplace);
            $checks['required_attributes'] = count(Arr::wrap($product->trendyol_attributes)) > 0;
        }

        if ($marketplace === 'hepsiburada') {
            $checks['marketplace_category'] = filled($product->hepsiburada_category_id);
            $checks['category_mapping'] = $this->hasCategoryMapping($product, $marketplace);
            $checks['required_attributes'] = count(Arr::wrap($product->hepsiburada_attributes)) > 0;
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

    private function hasImage(Product $product): bool
    {
        return filled($product->main_image_url)
            || count(Arr::wrap($product->gallery_images)) > 0
            || $product->images->isNotEmpty();
    }

    private function hasCategoryMapping(Product $product, string $marketplace): bool
    {
        if (! filled($product->category)) {
            return false;
        }

        return CategoryMapping::query()
            ->where('company_id', $product->company_id)
            ->where('marketplace_code', $marketplace)
            ->where('local_category', $product->category)
            ->exists();
    }
}
