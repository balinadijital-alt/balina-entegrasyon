<?php

namespace App\Http\Middleware;

use App\Models\Company;
use App\Services\Saas\SubscriptionService;
use Closure;
use Illuminate\Http\Request;

class EnsurePlanLimit
{
    public function handle(Request $request, Closure $next, string $metric)
    {
        $companyId = $request->integer('company_id') ?: $request->route('company')?->id;
        $company = $companyId ? Company::find($companyId) : null;

        if ($company && ! app(SubscriptionService::class)->canUse($company, $metric)) {
            return response()->json(['message' => "Paket limitiniz doldu: {$metric}. Planinizi yukseltin veya kullanim azaltin."], 402);
        }

        return $next($request);
    }
}
