<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ShippingCarrier;
use Illuminate\Http\JsonResponse;

class ShippingCarrierController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(ShippingCarrier::where('is_active', true)->orderBy('name')->get());
    }
}
