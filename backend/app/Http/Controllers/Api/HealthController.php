<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class HealthController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return $this->ready();
    }

    public function live(): JsonResponse
    {
        return response()->json([
            'status' => 'healthy',
            'checked_at' => now()->toISOString(),
            'checks' => ['app' => 'ok'],
        ]);
    }

    public function ready(): JsonResponse
    {
        $checks = [
            'app' => 'ok',
            'database' => $this->check(fn () => DB::select('select 1')),
            'cache' => $this->check(fn () => Cache::put('health_check', now()->timestamp, 10)),
            'queue' => $this->check(fn () => Queue::size() >= 0),
            'storage' => $this->check(fn () => $this->storageWriteCheck()),
        ];

        $healthy = ! in_array('failed', $checks, true);

        return response()->json([
            'status' => $healthy ? 'healthy' : 'degraded',
            'checked_at' => now()->toISOString(),
            'checks' => $checks,
            'queue' => $this->queueStats(),
            'scheduler' => [
                'last_run_at' => Cache::get('scheduler:last_run_at'),
            ],
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

    private function queueStats(): array
    {
        try {
            return [
                'backlog' => Queue::size(),
                'failed_jobs' => DB::table('failed_jobs')->count(),
            ];
        } catch (\Throwable $exception) {
            return [
                'backlog' => null,
                'failed_jobs' => null,
                'error' => $exception->getMessage(),
            ];
        }
    }

    private function storageWriteCheck(): void
    {
        $disk = Storage::disk(config('filesystems.default'));
        $path = 'health/'.Str::uuid().'.txt';

        $disk->put($path, now()->toISOString());
        $disk->delete($path);
    }
}
