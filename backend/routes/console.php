<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

Artisan::command('about:balina', function () {
    $this->info('Balina marketplace integration backend.');
});

Schedule::command('trendyol:sync-orders')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('trendyol:sync-price-inventory')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('hepsiburada:sync-orders')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('hepsiburada:sync-price-inventory')
    ->everyFifteenMinutes()
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('imports:dispatch-due-xml')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer();

Schedule::command('marketplace:dispatch-due-publish-drafts')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->onOneServer();

if (filter_var(env('HORIZON_ENABLED', false), FILTER_VALIDATE_BOOL)) {
    Schedule::command('horizon:snapshot')->everyFiveMinutes();
}

Schedule::call(fn () => Cache::put('scheduler:last_run_at', now()->toISOString(), now()->addMinutes(10)))->everyMinute();
Schedule::command('queue:prune-failed --hours=168')->daily();
Schedule::command('balina:prune-logs --days=30')->daily();
