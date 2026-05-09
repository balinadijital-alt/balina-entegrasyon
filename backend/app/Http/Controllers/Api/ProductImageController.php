<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\ProductImage;
use App\Services\Media\ProductImageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImageController extends Controller
{
    public function store(Request $request, Product $product, ProductImageService $service): JsonResponse
    {
        $data = $request->validate([
            'image' => ['required', 'image', 'max:4096'],
            'alt_text' => ['nullable', 'string', 'max:255'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        return response()->json($service->store($product, $data), 201);
    }

    public function destroy(ProductImage $image): JsonResponse
    {
        $image->delete();

        return response()->json(status: 204);
    }
}
