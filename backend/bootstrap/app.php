<?php

use App\Http\Middleware\LogApiRequest;
use App\Http\Middleware\EnsurePlanLimit;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\EnsureTenantCompany;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\SanitizeInput;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Support\Facades\Log;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->alias([
            'plan.limit' => EnsurePlanLimit::class,
            'role.any' => EnsureRole::class,
            'tenant.company' => EnsureTenantCompany::class,
        ]);
        $middleware->statefulApi();
        $middleware->api(append: [
            SecurityHeaders::class,
            SanitizeInput::class,
            LogApiRequest::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->report(function (\Throwable $exception) {
            if (! env('ERROR_MONITORING_DSN')) {
                return;
            }

            Log::channel('stack')->error('error_monitoring.report', [
                'message' => $exception->getMessage(),
                'class' => $exception::class,
                'file' => $exception->getFile(),
                'line' => $exception->getLine(),
            ]);
        });
    })->create();
