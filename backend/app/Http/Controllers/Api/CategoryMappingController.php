<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CategoryMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CategoryMappingController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(CategoryMapping::query()
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->when($request->filled('marketplace_code'), fn ($query) => $query->where('marketplace_code', $request->string('marketplace_code')))
            ->latest()
            ->paginate(50));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'marketplace_code' => ['required', 'in:trendyol,hepsiburada'],
            'local_category' => ['required', 'string', 'max:255'],
            'external_category_id' => ['required', 'string', 'max:255'],
            'external_category_name' => ['nullable', 'string', 'max:255'],
            'attributes' => ['nullable', 'array'],
        ]);

        $mapping = CategoryMapping::updateOrCreate(
            [
                'company_id' => $data['company_id'],
                'marketplace_code' => $data['marketplace_code'],
                'local_category' => $data['local_category'],
            ],
            $data
        );

        return response()->json($mapping, 201);
    }
}
