<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Imports\ProductImportService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductImportController extends Controller
{
    public function __invoke(Request $request, ProductImportService $service): JsonResponse
    {
        $data = $request->validate([
            'company_id' => ['required', 'exists:companies,id'],
            'file' => ['required', 'file', 'mimes:xlsx,xls,csv'],
        ]);

        return response()->json($service->import((int) $data['company_id'], $data['file']));
    }
}
