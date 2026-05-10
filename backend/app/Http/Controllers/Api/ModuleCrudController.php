<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ModuleRecordRequest;
use App\Services\Modules\ModuleRegistry;
use App\Services\Modules\ModuleResourceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ModuleCrudController extends Controller
{
    public function __construct(private ModuleResourceService $service, private ModuleRegistry $registry) {}

    public function index(Request $request, string $module): JsonResponse
    {
        return response()->json($this->service->paginate($request, $module));
    }

    public function store(ModuleRecordRequest $request, string $module): JsonResponse
    {
        return response()->json($this->service->create($request, $module, $request->validated()), 201);
    }

    public function show(string $module, int $id): JsonResponse
    {
        return response()->json($this->service->find($module, $id));
    }

    public function update(ModuleRecordRequest $request, string $module, int $id): JsonResponse
    {
        return response()->json($this->service->update($request, $module, $id, $request->validated()));
    }

    public function destroy(Request $request, string $module, int $id): JsonResponse
    {
        $this->service->delete($request, $module, $id);

        return response()->json(status: 204);
    }

    public function modules(): array
    {
        return $this->registry->modules();
    }
}
