<?php

namespace App\Http\Controllers\Api\Concerns;

use App\Services\Modules\ModuleResourceService;
use App\Services\Modules\ModuleRegistry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

trait HandlesDomainModules
{
    public function __construct(private ModuleResourceService $service, private ModuleRegistry $registry) {}

    public function index(Request $request, string $module): JsonResponse
    {
        $this->registry->assertDomain($this->domain(), $module);

        return response()->json($this->service->paginate($request, $module));
    }

    public function show(string $module, int $id): JsonResponse
    {
        $this->registry->assertDomain($this->domain(), $module);

        return response()->json($this->service->find($module, $id));
    }

    public function destroy(Request $request, string $module, int $id): JsonResponse
    {
        $this->registry->assertDomain($this->domain(), $module);
        $this->service->delete($request, $module, $id);

        return response()->json(status: 204);
    }

    abstract protected function domain(): string;
}
