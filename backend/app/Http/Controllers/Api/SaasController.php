<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Models\LicenseKey;
use App\Models\Partner;
use App\Models\SaasPlan;
use App\Models\Subscription;
use App\Services\Saas\SubscriptionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SaasController extends Controller
{
    public function plans(): JsonResponse
    {
        return response()->json(SaasPlan::where('is_active', true)->orderBy('monthly_price')->get());
    }

    public function subscriptions(Request $request, SubscriptionService $service): JsonResponse
    {
        return response()->json(Subscription::with(['company:id,name', 'plan', 'payment:id,status,amount'])
            ->latest()->paginate(30));
    }

    public function usage(Company $company, SubscriptionService $service): JsonResponse
    {
        return response()->json(['subscription' => $service->activeSubscription($company), 'usage' => $service->usage($company)]);
    }

    public function changePlan(Company $company, Request $request, SubscriptionService $service): JsonResponse
    {
        $data = $request->validate(['saas_plan_id' => ['required', 'exists:saas_plans,id'], 'payment_id' => ['nullable', 'exists:payments,id']]);
        $subscription = $service->changePlan($company, SaasPlan::findOrFail($data['saas_plan_id']), $data['payment_id'] ?? null);
        return response()->json(['message' => 'Abonelik plani guncellendi.', 'subscription' => $subscription->load('plan')]);
    }

    public function startTrial(Company $company, Request $request, SubscriptionService $service): JsonResponse
    {
        $data = $request->validate(['saas_plan_id' => ['required', 'exists:saas_plans,id']]);
        return response()->json($service->startTrial($company, SaasPlan::findOrFail($data['saas_plan_id']))->load('plan'), 201);
    }

    public function licenses(): JsonResponse
    {
        return response()->json(LicenseKey::with(['company:id,name', 'plan'])->latest()->paginate(30));
    }

    public function createLicense(Request $request, SubscriptionService $service): JsonResponse
    {
        $data = $request->validate(['saas_plan_id' => ['required', 'exists:saas_plans,id'], 'company_id' => ['nullable', 'exists:companies,id']]);
        return response()->json($service->generateLicense(SaasPlan::findOrFail($data['saas_plan_id']), isset($data['company_id']) ? Company::find($data['company_id']) : null), 201);
    }

    public function activateLicense(Request $request, SubscriptionService $service): JsonResponse
    {
        $data = $request->validate(['key' => ['required', 'string'], 'company_id' => ['required', 'exists:companies,id']]);
        $license = LicenseKey::where('key', $data['key'])->whereIn('status', ['available', 'active'])->firstOrFail();
        $company = Company::findOrFail($data['company_id']);
        $license->update(['company_id' => $company->id, 'status' => 'active', 'activated_at' => now()]);
        $service->changePlan($company, $license->plan);
        return response()->json(['message' => 'Lisans aktive edildi.', 'license' => $license->fresh('plan')]);
    }

    public function partners(): JsonResponse
    {
        return response()->json(Partner::withCount('companies')->latest()->paginate(30));
    }

    public function createPartner(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:255'], 'email' => ['nullable', 'email'], 'phone' => ['nullable', 'string'], 'code' => ['required', 'string', 'unique:partners,code'], 'commission_rate' => ['nullable', 'numeric', 'min:0']]);
        return response()->json(Partner::create($data + ['status' => 'active']), 201);
    }
}
