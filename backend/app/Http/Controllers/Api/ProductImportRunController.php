<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ProductImportRun;
use App\Services\Audit\AuditLogger;
use App\Services\Imports\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImportRunController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ProductImportRun::with(['company:id,name', 'xmlSource:id,name'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(30));
    }

    public function show(ProductImportRun $importRun): JsonResponse
    {
        $this->abortIfImportRunNotTenant(request(), $importRun);

        return response()->json($importRun->load(['company:id,name', 'xmlSource:id,name', 'errors' => fn ($query) => $query->latest()->limit(200)]));
    }

    public function previewExcel(Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv'],
            'field_mapping' => ['nullable', 'array'],
        ]);
        $data = $this->forceTenantCompany($request, $data);

        return response()->json($service->previewExcel((int) $data['company_id'], $data['file'], $data['field_mapping'] ?? []));
    }

    public function queueExcel(Request $request, ProductImportService $service, AuditLogger $audit): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'field_mapping' => ['required', 'array'],
            'options' => ['nullable', 'array'],
        ]);
        $data = $this->forceTenantCompany($request, $data);

        $run = $service->queueExcel((int) $data['company_id'], $data['file'], $data);
        $audit->logAction($request, 'import', 'product_import.excel.queue', $run, [
            'company_id' => $run->company_id,
            'import_run_id' => $run->id,
            'source_type' => $run->source_type,
            'queued' => true,
        ], null, ['field_mapping' => $data['field_mapping'], 'options' => $data['options'] ?? []]);

        return response()->json(['message' => 'Excel import kuyruga alindi.', 'import_run_id' => $run->id, 'queued' => true], 202);
    }

    public function retry(ProductImportRun $importRun, ProductImportService $service, AuditLogger $audit): JsonResponse
    {
        $this->abortIfImportRunNotTenant(request(), $importRun);

        $old = $importRun->toArray();
        $run = $service->retry($importRun);
        $audit->logAction(request(), 'import', 'product_import.retry', $run, [
            'company_id' => $run->company_id,
            'import_run_id' => $run->id,
            'source_type' => $run->source_type,
            'xml_source_id' => $run->xml_source_id,
            'queued' => true,
        ], $old, $run->fresh()->toArray());

        return response()->json(['message' => 'Import tekrar kuyruga alindi.', 'import_run_id' => $run->id, 'queued' => true], 202);
    }
}
