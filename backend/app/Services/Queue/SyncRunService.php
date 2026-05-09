<?php

namespace App\Services\Queue;

use App\Models\MarketplaceAccount;
use App\Models\QueueNotification;
use App\Models\SyncRun;
use Illuminate\Support\Facades\Cache;
use RuntimeException;

class SyncRunService
{
    public function create(MarketplaceAccount $account, string $type): SyncRun
    {
        $lockKey = $this->lockKey($account, $type);

        if (! Cache::lock($lockKey, 900)->get()) {
            throw new RuntimeException('Bu entegrasyon icin ayni senkronizasyon zaten calisiyor.');
        }

        return SyncRun::create([
            'marketplace_account_id' => $account->id,
            'type' => $type,
            'queue' => 'marketplace-sync',
            'status' => 'queued',
            'message' => 'Is kuyruga alindi.',
        ]);
    }

    public function start(SyncRun $syncRun, ?string $jobUuid = null, int $attempts = 0): void
    {
        $syncRun->update([
            'job_uuid' => $jobUuid,
            'attempts' => $attempts,
            'status' => 'running',
            'started_at' => now(),
            'message' => 'Islem calisiyor.',
        ]);
    }

    public function finish(SyncRun $syncRun, array $result): void
    {
        $syncRun->update([
            'status' => 'completed',
            'processed_count' => $result['count'] ?? 0,
            'message' => $result['message'] ?? 'Islem tamamlandi.',
            'duration_ms' => $syncRun->started_at ? (int) $syncRun->started_at->diffInMilliseconds(now()) : null,
            'finished_at' => now(),
        ]);

        $this->notify($syncRun, 'success', 'Senkronizasyon tamamlandi', $syncRun->message);
        $this->release($syncRun);
    }

    public function fail(SyncRun $syncRun, string $message): void
    {
        $syncRun->update([
            'status' => 'failed',
            'error_message' => $message,
            'duration_ms' => $syncRun->started_at ? (int) $syncRun->started_at->diffInMilliseconds(now()) : null,
            'finished_at' => now(),
        ]);

        $this->notify($syncRun, 'error', 'Senkronizasyon basarisiz', $message);
        $this->release($syncRun);
    }

    public function notify(SyncRun $syncRun, string $level, string $title, ?string $message = null, array $payload = []): QueueNotification
    {
        return QueueNotification::create([
            'sync_run_id' => $syncRun->id,
            'level' => $level,
            'title' => $title,
            'message' => $message,
            'payload' => $payload,
        ]);
    }

    private function release(SyncRun $syncRun): void
    {
        Cache::lock($this->lockKey($syncRun->marketplace, $syncRun->type))->forceRelease();
    }

    private function lockKey(MarketplaceAccount $account, string $type): string
    {
        return "sync-lock:{$account->id}:{$type}";
    }
}
