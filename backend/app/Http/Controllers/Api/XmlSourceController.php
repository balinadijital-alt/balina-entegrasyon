<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\XmlSource;
use App\Services\Imports\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class XmlSourceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(XmlSource::with('company:id,name')
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $source = XmlSource::create($this->validated($request));

        return response()->json($source->load('company:id,name'), 201);
    }

    public function update(Request $request, XmlSource $xmlSource): JsonResponse
    {
        $xmlSource->update($this->validated($request, true));

        return response()->json($xmlSource->load('company:id,name'));
    }

    public function destroy(XmlSource $xmlSource): JsonResponse
    {
        $xmlSource->delete();

        return response()->json(status: 204);
    }

    public function preview(XmlSource $xmlSource, Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'field_mapping' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
        ]);

        return response()->json($service->previewXmlSource($xmlSource, $data['field_mapping'] ?? [], $data['options'] ?? []));
    }

    public function import(XmlSource $xmlSource, Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'field_mapping' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
        ]);

        $run = $service->queueXml($xmlSource, $data);

        return response()->json(['message' => 'XML import kuyruga alindi.', 'import_run_id' => $run->id, 'queued' => true], 202);
    }

    private function validated(Request $request, bool $partial = false): array
    {
        return $request->validate([
            'company_id' => [$partial ? 'sometimes' : 'required', 'exists:companies,id'],
            'name' => [$partial ? 'sometimes' : 'required', 'string', 'max:255'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'url' => [$partial ? 'sometimes' : 'required', 'url'],
            'username' => ['nullable', 'string'],
            'password' => ['nullable', 'string'],
            'frequency_minutes' => ['nullable', 'integer', 'min:5', 'max:10080'],
            'field_mapping' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
            'is_active' => ['boolean'],
        ]);
    }
}
