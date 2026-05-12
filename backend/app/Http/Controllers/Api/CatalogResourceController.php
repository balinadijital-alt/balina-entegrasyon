<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CatalogResource;
use App\Models\Product;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CatalogResourceController extends Controller
{
    private const TYPES = [
        'categories',
        'brands',
        'attributes',
        'tags',
        'suppliers',
        'tax-rates',
        'units',
        'defaults',
    ];

    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(self::TYPES)],
            'active' => ['nullable', 'boolean'],
            'search' => ['nullable', 'string', 'max:255'],
        ]);

        $companyId = $this->tenantCompanyId($request);
        $resources = CatalogResource::query()
            ->with(['parent:id,name,type', 'children:id,parent_id,name,type,is_active,sort_order'])
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->when(! $companyId && $request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->where('type', $data['type'])
            ->when($request->filled('active'), fn ($query) => $query->where('is_active', $request->boolean('active')))
            ->when($request->filled('search'), fn ($query) => $query->where('name', 'like', '%'.$request->string('search').'%'))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(fn (CatalogResource $resource) => $this->withProductCount($resource));

        return response()->json(['data' => $resources]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['company_id'] = $this->tenantCompanyId($request) ?: $data['company_id'];

        $resource = CatalogResource::create($data);

        return response()->json($this->withProductCount($resource->load('parent', 'children')), 201);
    }

    public function update(Request $request, CatalogResource $catalogResource): JsonResponse
    {
        $this->abortIfNotTenant($request, $catalogResource);
        $data = $this->validated($request, $catalogResource);
        $data['company_id'] = $this->tenantCompanyId($request) ?: $data['company_id'];

        $catalogResource->update($data);

        return response()->json($this->withProductCount($catalogResource->fresh(['parent', 'children'])));
    }

    public function destroy(Request $request, CatalogResource $catalogResource): JsonResponse
    {
        $this->abortIfNotTenant($request, $catalogResource);
        $catalogResource->delete();

        return response()->json(status: 204);
    }

    private function validated(Request $request, ?CatalogResource $resource = null): array
    {
        return $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'parent_id' => ['nullable', 'exists:catalog_resources,id'],
            'type' => ['required', Rule::in(self::TYPES)],
            'name' => ['required', 'string', 'max:255'],
            'code' => ['nullable', 'string', 'max:120'],
            'description' => ['nullable', 'string'],
            'image_url' => ['nullable', 'url', 'max:2000'],
            'values' => ['nullable', 'array'],
            'settings' => ['nullable', 'array'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active' => ['nullable', 'boolean'],
        ]);
    }

    private function withProductCount(CatalogResource $resource): CatalogResource
    {
        $resource->setAttribute('product_count', match ($resource->type) {
            'categories' => Product::where('company_id', $resource->company_id)->where('category', $resource->name)->count(),
            'brands' => Product::where('company_id', $resource->company_id)->where('brand', $resource->name)->count(),
            'suppliers' => Product::where('company_id', $resource->company_id)->where('supplier_name', $resource->name)->count(),
            default => 0,
        });

        return $resource;
    }
}
