<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\InboundWebhookDelivery;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InboundWebhookDeliveryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'marketplace_code' => ['nullable', 'string', 'max:64'],
            'status' => ['nullable', 'string', 'max:64'],
            'signature_valid' => ['nullable', 'boolean'],
            'company_id' => ['nullable', 'exists:companies,id'],
            'search' => ['nullable', 'string', 'max:255'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        $tenantCompanyId = $this->tenantCompanyId($request);
        $isSuperAdmin = $request->user()?->hasRole('super_admin');
        $perPage = $request->integer('per_page', $request->integer('limit', 50));

        return response()->json(InboundWebhookDelivery::query()
            ->with(['company:id,name', 'marketplaceAccount:id,name,supplier_id'])
            ->when($tenantCompanyId, fn ($query, $companyId) => $query->where('company_id', $companyId))
            ->when($isSuperAdmin && $request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->when($request->filled('marketplace_code'), fn ($query) => $query->where('marketplace_code', $request->string('marketplace_code')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->has('signature_valid'), fn ($query) => $query->where('signature_valid', $request->boolean('signature_valid')))
            ->when($request->filled('from'), fn ($query) => $query->where('created_at', '>=', $request->date('from')->startOfDay()))
            ->when($request->filled('to'), fn ($query) => $query->where('created_at', '<=', $request->date('to')->endOfDay()))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = '%'.$request->string('search')->toString().'%';

                $query->where(function ($inner) use ($search) {
                    $inner->where('delivery_id', 'like', $search)
                        ->orWhere('idempotency_key', 'like', $search)
                        ->orWhere('event', 'like', $search)
                        ->orWhere('last_error', 'like', $search);
                });
            })
            ->latest()
            ->paginate($perPage));
    }
}
