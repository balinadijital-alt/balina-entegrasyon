<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\XmlSource;
use App\Services\Audit\AuditLogger;
use App\Services\Imports\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class XmlSourceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(XmlSource::with('company:id,name')
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->latest()
            ->paginate(20));
    }

    public function store(Request $request, AuditLogger $audit): JsonResponse
    {
        $source = XmlSource::create($this->forceTenantCompany($request, $this->validated($request)));
        $audit->logAction($request, 'import', 'xml_source.create', $source, ['company_id' => $source->company_id, 'xml_source_id' => $source->id], null, $source->toArray());

        return response()->json($source->load('company:id,name'), 201);
    }

    public function update(Request $request, XmlSource $xmlSource, AuditLogger $audit): JsonResponse
    {
        $this->abortIfXmlSourceNotTenant($request, $xmlSource);

        $old = $xmlSource->toArray();
        $xmlSource->update($audit->preserveBlankSecrets($xmlSource, $this->forceTenantCompany($request, $this->validated($request, true)), ['password']));
        $audit->logAction($request, 'import', 'xml_source.update', $xmlSource, ['company_id' => $xmlSource->company_id, 'xml_source_id' => $xmlSource->id], $old, $xmlSource->fresh()->toArray());

        return response()->json($xmlSource->load('company:id,name'));
    }

    public function destroy(XmlSource $xmlSource, AuditLogger $audit): JsonResponse
    {
        $this->abortIfXmlSourceNotTenant(request(), $xmlSource);

        $old = $xmlSource->toArray();
        $xmlSource->delete();
        $audit->logAction(request(), 'import', 'xml_source.delete', $xmlSource, ['company_id' => $old['company_id'] ?? null, 'xml_source_id' => $xmlSource->id], $old);

        return response()->json(status: 204);
    }

    public function preview(XmlSource $xmlSource, Request $request, ProductImportService $service): JsonResponse
    {
        $this->abortIfXmlSourceNotTenant($request, $xmlSource);

        $data = $request->validate([
            'field_mapping' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
        ]);

        return response()->json($service->previewXmlSource($xmlSource, $data['field_mapping'] ?? [], $data['options'] ?? []));
    }

    public function import(XmlSource $xmlSource, Request $request, ProductImportService $service, AuditLogger $audit): JsonResponse
    {
        $this->abortIfXmlSourceNotTenant($request, $xmlSource);

        $data = $request->validate([
            'field_mapping' => ['nullable', 'array'],
            'options' => ['nullable', 'array'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
        ]);

        $run = $service->queueXml($xmlSource, $data);
        $audit->logAction($request, 'import', 'xml_source.import', $xmlSource, [
            'company_id' => $xmlSource->company_id,
            'xml_source_id' => $xmlSource->id,
            'import_run_id' => $run->id,
            'queued' => true,
        ], null, $data);

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
