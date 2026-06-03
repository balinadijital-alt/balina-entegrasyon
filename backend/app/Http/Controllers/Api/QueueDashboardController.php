<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\QueueNotification;
use App\Models\SyncRun;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class QueueDashboardController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $companyId = $this->tenantCompanyId($request);
        $syncRuns = SyncRun::query()
            ->when($companyId, fn ($query) => $query->whereHas('marketplace', fn ($marketplace) => $marketplace->where('company_id', $companyId)));
        $notifications = QueueNotification::query()
            ->when($companyId, fn ($query) => $query->whereHas('syncRun.marketplace', fn ($marketplace) => $marketplace->where('company_id', $companyId)));

        return response()->json([
            'redis' => $this->redisStatus(),
            'stats' => [
                'queued' => (clone $syncRuns)->where('status', 'queued')->count(),
                'running' => (clone $syncRuns)->where('status', 'running')->count(),
                'completed' => (clone $syncRuns)->where('status', 'completed')->count(),
                'failed' => (clone $syncRuns)->where('status', 'failed')->count(),
                'failed_jobs' => $companyId ? 0 : DB::table('failed_jobs')->count(),
            ],
            'recent_runs' => (clone $syncRuns)->with('marketplace.company:id,name')->latest()->limit(25)->get(),
            'failed_jobs' => $companyId ? [] : DB::table('failed_jobs')->latest('failed_at')->limit(25)->get(),
            'notifications' => (clone $notifications)->latest()->limit(20)->get(),
        ]);
    }

    public function retry(Request $request, string $uuid): JsonResponse
    {
        if ($this->tenantCompanyId($request)) {
            abort(403, 'Global failed job retry sadece super admin tarafindan yapilabilir.');
        }

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
