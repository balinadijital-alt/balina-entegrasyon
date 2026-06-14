<?php

namespace App\Services\Marketplaces;

use App\Models\MarketplaceAccount;
use App\Models\MarketplaceCatalogAttribute;
use App\Models\MarketplaceCatalogAttributeValue;
use App\Models\MarketplaceCatalogBrand;
use App\Models\MarketplaceCatalogCategory;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class MarketplaceCatalogCacheService
{
    public function __construct(private readonly TrendyolService $trendyol)
    {
    }

    public function syncTrendyolCategories(MarketplaceAccount $account): Collection
    {
        $syncedAt = now();
        $items = $this->flattenCategories($this->trendyol->categories($account)['categories'] ?? []);

        return $items->map(function (array $item) use ($syncedAt) {
            return MarketplaceCatalogCategory::updateOrCreate(
                ['marketplace_code' => 'trendyol', 'external_id' => $item['external_id']],
                $item + ['last_synced_at' => $syncedAt]
            );
        })->values();
    }

    public function syncTrendyolBrands(MarketplaceAccount $account): Collection
    {
        $syncedAt = now();
        $items = collect($this->trendyol->brands($account, ['size' => 500])['brands'] ?? [])
            ->map(fn (array $brand) => $this->brandPayload($brand))
            ->filter(fn (?array $brand) => filled($brand['name'] ?? null));

        return $items->map(function (array $item) use ($syncedAt) {
            return MarketplaceCatalogBrand::updateOrCreate(
                ['marketplace_code' => 'trendyol', 'normalized_name' => $item['normalized_name']],
                $item + ['last_synced_at' => $syncedAt]
            );
        })->values();
    }

    public function syncTrendyolCategoryAttributes(MarketplaceAccount $account, string $categoryId): Collection
    {
        $syncedAt = now();
        $response = $this->trendyol->categoryAttributes($account, $categoryId);
        $items = collect($response['attributes'] ?? [])
            ->map(fn (array $attribute) => $this->attributePayload($attribute, $categoryId))
            ->filter(fn (?array $attribute) => filled($attribute['external_id'] ?? null) && filled($attribute['name'] ?? null));

        return $items->map(function (array $item) use ($syncedAt) {
            $model = MarketplaceCatalogAttribute::updateOrCreate(
                Arr::only($item, ['marketplace_code', 'category_external_id', 'external_id']),
                $item + ['last_synced_at' => $syncedAt]
            );

            collect(data_get($item, 'metadata.attributeValues', data_get($item, 'metadata.values', [])))
                ->map(fn (array $value) => $this->attributeValuePayload($value, $item['category_external_id'], $item['external_id']))
                ->filter(fn (?array $value) => filled($value['external_id'] ?? null) && filled($value['name'] ?? null))
                ->each(fn (array $value) => MarketplaceCatalogAttributeValue::updateOrCreate(
                    Arr::only($value, ['marketplace_code', 'category_external_id', 'attribute_external_id', 'external_id']),
                    $value + ['last_synced_at' => $syncedAt]
                ));

            return $model;
        })->values();
    }

    public function syncTrendyolAttributeValues(MarketplaceAccount $account, string $categoryId, string $attributeId): Collection
    {
        $syncedAt = now();
        $items = collect($this->trendyol->categoryAttributeValues($account, $categoryId, $attributeId)['values'] ?? [])
            ->map(fn (array $value) => $this->attributeValuePayload($value, $categoryId, $attributeId))
            ->filter(fn (?array $value) => filled($value['external_id'] ?? null) && filled($value['name'] ?? null));

        return $items->map(function (array $item) use ($syncedAt) {
            return MarketplaceCatalogAttributeValue::updateOrCreate(
                Arr::only($item, ['marketplace_code', 'category_external_id', 'attribute_external_id', 'external_id']),
                $item + ['last_synced_at' => $syncedAt]
            );
        })->values();
    }

    public function cachedCategories(string $marketplaceCode, ?string $search = null): EloquentCollection
    {
        return MarketplaceCatalogCategory::query()
            ->where('marketplace_code', $marketplaceCode)
            ->when($search, fn ($query) => $query->where(function ($inner) use ($search) {
                $inner->where('name', 'like', "%{$search}%")
                    ->orWhere('path', 'like', "%{$search}%")
                    ->orWhere('external_id', 'like', "%{$search}%");
            }))
            ->orderBy('path')
            ->limit(200)
            ->get();
    }

    public function cachedBrands(string $marketplaceCode, ?string $search = null): EloquentCollection
    {
        return MarketplaceCatalogBrand::query()
            ->where('marketplace_code', $marketplaceCode)
            ->when($search, function ($query) use ($search) {
                $normalized = $this->normalizeName($search);
                $query->where(fn ($inner) => $inner
                    ->where('name', 'like', "%{$search}%")
                    ->orWhere('normalized_name', 'like', "%{$normalized}%"));
            })
            ->orderBy('name')
            ->limit(200)
            ->get();
    }

    public function cachedAttributes(string $marketplaceCode, string $categoryId): EloquentCollection
    {
        return MarketplaceCatalogAttribute::query()
            ->where('marketplace_code', $marketplaceCode)
            ->where('category_external_id', $categoryId)
            ->orderByDesc('required')
            ->orderBy('name')
            ->get();
    }

    public function cachedAttributeValues(string $marketplaceCode, string $categoryId, string $attributeId): EloquentCollection
    {
        return MarketplaceCatalogAttributeValue::query()
            ->where('marketplace_code', $marketplaceCode)
            ->where('category_external_id', $categoryId)
            ->where('attribute_external_id', $attributeId)
            ->orderBy('name')
            ->limit(500)
            ->get();
    }

    private function flattenCategories(array $categories, ?string $parentId = null, array $path = [], int $level = 0): Collection
    {
        return collect($categories)->flatMap(function (array $category) use ($parentId, $path, $level) {
            $id = (string) data_get($category, 'id', data_get($category, 'categoryId', data_get($category, 'externalId')));
            $name = (string) data_get($category, 'name', data_get($category, 'categoryName', ''));
            if ($id === '' || $name === '') {
                return [];
            }

            $children = data_get($category, 'subCategories', data_get($category, 'children', [])) ?: [];
            $nextPath = [...$path, $name];
            $payload = [[
                'marketplace_code' => 'trendyol',
                'external_id' => $id,
                'parent_external_id' => (string) data_get($category, 'parentId', $parentId) ?: null,
                'name' => $name,
                'path' => implode(' > ', $nextPath),
                'level' => $level,
                'is_leaf' => count($children) === 0,
                'metadata' => $category,
            ]];

            return collect($payload)->merge($this->flattenCategories($children, $id, $nextPath, $level + 1));
        });
    }

    private function brandPayload(array $brand): ?array
    {
        $name = data_get($brand, 'name', data_get($brand, 'brandName'));
        if (blank($name)) {
            return null;
        }

        return [
            'marketplace_code' => 'trendyol',
            'external_id' => filled(data_get($brand, 'id', data_get($brand, 'brandId'))) ? (string) data_get($brand, 'id', data_get($brand, 'brandId')) : null,
            'name' => (string) $name,
            'normalized_name' => $this->normalizeName($name),
            'metadata' => $brand,
        ];
    }

    private function attributePayload(array $attribute, string $categoryId): ?array
    {
        $externalId = data_get($attribute, 'attribute.id', data_get($attribute, 'attributeId', data_get($attribute, 'id')));
        $name = data_get($attribute, 'attribute.name', data_get($attribute, 'attributeName', data_get($attribute, 'name')));
        if (blank($externalId) || blank($name)) {
            return null;
        }

        return [
            'marketplace_code' => 'trendyol',
            'category_external_id' => (string) $categoryId,
            'external_id' => (string) $externalId,
            'name' => (string) $name,
            'required' => (bool) data_get($attribute, 'required', data_get($attribute, 'isRequired', false)),
            'allow_custom' => (bool) data_get($attribute, 'allowCustom', data_get($attribute, 'allowCustomValue', false)),
            'value_type' => data_get($attribute, 'attribute.type', data_get($attribute, 'type')),
            'metadata' => $attribute,
        ];
    }

    private function attributeValuePayload(array $value, string $categoryId, string $attributeId): ?array
    {
        $externalId = data_get($value, 'id', data_get($value, 'attributeValueId', data_get($value, 'value')));
        $name = data_get($value, 'name', data_get($value, 'attributeValueName', data_get($value, 'value')));
        if (blank($externalId) || blank($name)) {
            return null;
        }

        return [
            'marketplace_code' => 'trendyol',
            'category_external_id' => (string) $categoryId,
            'attribute_external_id' => (string) $attributeId,
            'external_id' => (string) $externalId,
            'name' => (string) $name,
            'metadata' => $value,
        ];
    }

    private function normalizeName(string $name): string
    {
        return (string) Str::of($name)
            ->lower()
            ->ascii()
            ->replaceMatches('/[^a-z0-9]+/', '')
            ->trim();
    }
}
