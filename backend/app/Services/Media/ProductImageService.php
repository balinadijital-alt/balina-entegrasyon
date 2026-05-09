<?php

namespace App\Services\Media;

use App\Models\Product;
use App\Models\ProductImage;
use Illuminate\Support\Facades\Storage;

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
}
