<?php

namespace App\Services\Media;

use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProductImageService
{
    public function store(Product $product, array $data): ProductImage
    {
        $path = Storage::disk('public')->putFile("products/{$product->id}", $data['image']);

        return $product->images()->create([
            'path' => $path,
            'alt_text' => $data['alt_text'] ?? $product->name,
            'sort_order' => $data['sort_order'] ?? 0,
        ]);
    }

    public function storeFromUrl(Product $product, string $url, int $sortOrder = 0): ?ProductImage
    {
        if (! filter_var($url, FILTER_VALIDATE_URL)) {
            return null;
        }

        $response = Http::timeout(20)->retry(2, 500, throw: false)->get($url);

        if (! $response->successful()) {
            return null;
        }

        $contentType = strtolower((string) $response->header('Content-Type'));
        $extension = str_contains($contentType, 'png') ? 'png' : 'jpg';
        $path = "products/{$product->id}/".Str::uuid().".{$extension}";

        Storage::disk('public')->put($path, $response->body());

        return $product->images()->firstOrCreate(
            ['path' => $path],
            ['alt_text' => $product->name, 'sort_order' => $sortOrder]
        );
    }
}
