<?php

namespace App\Services\Saas;

use App\Models\Company;
use App\Models\LicenseKey;
use App\Models\SaasPlan;
use App\Models\Subscription;
use App\Models\UsageCounter;
use Illuminate\Support\Str;

class SubscriptionService
{
    public function activeSubscription(Company $company): ?Subscription
    {
        return $company->subscriptions()->with('plan')->whereIn('status', ['trial', 'active'])->first();
    }

    public function usage(Company $company): array
    {
        $subscription = $this->activeSubscription($company);
        $limits = $subscription?->plan?->limits ?? [];
        $used = [
            'products' => $company->products()->count(),
            'users' => 1,
            'marketplaces' => $company->marketplaces()->count(),
            'xml_sources' => class_exists(\App\Models\XmlSource::class) ? \App\Models\XmlSource::where('company_id', $company->id)->count() : 0,
            'orders' => \App\Models\Order::where('company_id', $company->id)->where('created_at', '>=', now()->startOfMonth())->count(),
        ];

        return collect($used)->mapWithKeys(function (int $value, string $metric) use ($limits, $company) {
            $limit = (int) ($limits[$metric] ?? 0);
            UsageCounter::updateOrCreate(
                ['company_id' => $company->id, 'metric' => $metric],
                ['used' => $value, 'limit' => $limit, 'period_starts_at' => now()->startOfMonth(), 'period_ends_at' => now()->endOfMonth()]
            );
            return [$metric => ['used' => $value, 'limit' => $limit, 'remaining' => $limit === 0 ? null : max(0, $limit - $value)]];
        })->all();
    }

    public function canUse(Company $company, string $metric, int $increment = 1): bool
    {
        $subscription = $this->activeSubscription($company);
        $limit = (int) data_get($subscription?->plan?->limits, $metric, 0);
        if ($limit === 0) return true;
        $usage = $this->usage($company)[$metric]['used'] ?? 0;
        return ($usage + $increment) <= $limit;
    }

    public function changePlan(Company $company, SaasPlan $plan, ?int $paymentId = null): Subscription
    {
        $company->subscriptions()->whereIn('status', ['trial', 'active'])->update(['status' => 'changed', 'cancelled_at' => now()]);
        return Subscription::create([
            'company_id' => $company->id,
            'saas_plan_id' => $plan->id,
            'payment_id' => $paymentId,
            'status' => 'active',
            'starts_at' => now(),
            'ends_at' => now()->addMonth(),
        ]);
    }

    public function startTrial(Company $company, SaasPlan $plan): Subscription
    {
        return Subscription::firstOrCreate(
            ['company_id' => $company->id, 'status' => 'trial'],
            ['saas_plan_id' => $plan->id, 'starts_at' => now(), 'trial_ends_at' => now()->addDays(14), 'ends_at' => now()->addDays(14)]
        );
    }

    public function generateLicense(SaasPlan $plan, ?Company $company = null): LicenseKey
    {
        return LicenseKey::create([
            'company_id' => $company?->id,
            'saas_plan_id' => $plan->id,
            'key' => strtoupper('BALINA-'.Str::random(6).'-'.Str::random(6).'-'.Str::random(6)),
            'status' => $company ? 'active' : 'available',
            'activated_at' => $company ? now() : null,
            'expires_at' => now()->addYear(),
        ]);
    }
}
