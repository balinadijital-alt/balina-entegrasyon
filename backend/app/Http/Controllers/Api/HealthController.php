<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $checks = [
            'app' => 'ok',
            'database' => $this->check(fn () => DB::select('select 1')),
            'cache' => $this->check(fn () => Cache::put('health_check', now()->timestamp, 10)),
            'queue' => $this->check(fn () => Queue::size() >= 0),
            'storage' => $this->check(fn () => Storage::disk(config('filesystems.default'))->exists('.gitignore') || true),
        ];

        $healthy = ! in_array('failed', $checks, true);

        return response()->json([
            'status' => $healthy ? 'healthy' : 'degraded',
            'checked_at' => now()->toISOString(),
            'checks' => $checks,
        ], $healthy ? 200 : 503);
    }

    private function check(callable $callback): string
    {
        try {
            $callback();
            return 'ok';
        } catch (\Throwable) {
            return 'failed';
        }
    }
}
