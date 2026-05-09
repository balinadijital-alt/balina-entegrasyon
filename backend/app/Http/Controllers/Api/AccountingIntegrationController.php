<?php
namespace App\Http\Controllers\Api;
use App\Http\Controllers\Controller;
use App\Models\AccountingIntegration;
use Illuminate\Http\JsonResponse;
class AccountingIntegrationController extends Controller { public function index(): JsonResponse { return response()->json(AccountingIntegration::where('is_active', true)->orderBy('name')->get()); } }
