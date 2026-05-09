<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PaymentProvider;
use Illuminate\Http\JsonResponse;

class PaymentProviderController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(PaymentProvider::where('is_active', true)->orderBy('name')->get());
    }
}
