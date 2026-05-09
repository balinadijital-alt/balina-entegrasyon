<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ApiLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ApiLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(ApiLog::query()
            ->with('company:id,name')
            ->when($request->filled('marketplace_code'), fn ($query) => $query->where('marketplace_code', $request->string('marketplace_code')))
            ->latest()
            ->paginate(50));
    }
}
