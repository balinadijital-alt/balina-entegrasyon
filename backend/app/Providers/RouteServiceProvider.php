<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute((int) env('API_RATE_LIMIT_PER_MINUTE', 120))->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('login', fn (Request $request) => [
            Limit::perMinute((int) env('LOGIN_RATE_LIMIT_PER_MINUTE', 5))->by($request->ip().'|'.strtolower((string) $request->input('email'))),
            Limit::perMinute((int) env('LOGIN_IP_RATE_LIMIT_PER_MINUTE', 20))->by($request->ip()),
        ]);
    }
}
