<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QueueNotification;
use App\Models\SyncRun;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class QueueDashboardController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'redis' => $this->redisStatus(),
            'stats' => [
                'queued' => SyncRun::where('status', 'queued')->count(),
                'running' => SyncRun::where('status', 'running')->count(),
                'completed' => SyncRun::where('status', 'completed')->count(),
                'failed' => SyncRun::where('status', 'failed')->count(),
                'failed_jobs' => DB::table('failed_jobs')->count(),
            ],
            'recent_runs' => SyncRun::with('marketplace.company:id,name')->latest()->limit(25)->get(),
            'failed_jobs' => DB::table('failed_jobs')->latest('failed_at')->limit(25)->get(),
            'notifications' => QueueNotification::latest()->limit(20)->get(),
        ]);
    }

    public function retry(string $uuid): JsonResponse
    {
        Artisan::call('queue:retry', ['id' => [$uuid]]);

        QueueNotification::create([
            'level' => 'info',
            'title' => 'Failed job retry edildi',
            'message' => $uuid,
        ]);

        return response()->json(['message' => 'Job tekrar kuyruga alindi.']);
    }

    private function redisStatus(): array
    {
        try {
            $pong = Redis::connection()->ping();

            return ['connected' => true, 'message' => is_string($pong) ? $pong : 'PONG'];
        } catch (\Throwable $exception) {
            return ['connected' => false, 'message' => $exception->getMessage()];
        }
    }
}
