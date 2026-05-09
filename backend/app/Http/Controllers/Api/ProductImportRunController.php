<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductImportRun;
use App\Services\Imports\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImportRunController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ProductImportRun::with(['company:id,name', 'xmlSource:id,name'])
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(30));
    }

    public function show(ProductImportRun $importRun): JsonResponse
    {
        return response()->json($importRun->load(['company:id,name', 'xmlSource:id,name', 'errors' => fn ($query) => $query->latest()->limit(200)]));
    }

    public function previewExcel(Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv'],
            'field_mapping' => ['nullable', 'array'],
        ]);

        return response()->json($service->previewExcel((int) $data['company_id'], $data['file'], $data['field_mapping'] ?? []));
    }

    public function queueExcel(Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'field_mapping' => ['required', 'array'],
            'options' => ['nullable', 'array'],
        ]);

        $run = $service->queueExcel((int) $data['company_id'], $data['file'], $data);

        return response()->json(['message' => 'Excel import kuyruga alindi.', 'import_run_id' => $run->id, 'queued' => true], 202);
    }

    public function retry(ProductImportRun $importRun, ProductImportService $service): JsonResponse
    {
        $run = $service->retry($importRun);

        return response()->json(['message' => 'Import tekrar kuyruga alindi.', 'import_run_id' => $run->id, 'queued' => true], 202);
    }
}
