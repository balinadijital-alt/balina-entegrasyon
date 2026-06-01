<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Analytics\AnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AnalyticsController extends Controller
{
    public function overview(Request $request, AnalyticsService $analytics): JsonResponse
    {
        $data = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'marketplace_code' => ['nullable', 'string', 'max:50'],
        ]);

        $tenantCompanyId = $this->tenantCompanyId($request);

        if ($tenantCompanyId) {
            $data['company_id'] = $tenantCompanyId;
        } elseif ($request->filled('company_id')) {
            $data['company_id'] = $request->integer('company_id');
        }

        return response()->json($analytics->overview($data));
    }
}
