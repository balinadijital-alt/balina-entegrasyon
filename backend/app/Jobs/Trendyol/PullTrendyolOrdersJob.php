<?php

namespace App\Jobs\Trendyol;

use App\Models\MarketplaceAccount;
use App\Models\SyncRun;
use App\Services\Queue\SyncRunService;
use App\Services\Marketplaces\TrendyolService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;
use Throwable;

class PullTrendyolOrdersJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 180;
    public bool $failOnTimeout = true;

    public function __construct(public MarketplaceAccount $account, public SyncRun $syncRun)
    {
        $this->onQueue('marketplace-sync');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("trendyol-orders:{$this->account->id}"))->expireAfter(900)->dontRelease()];
    }

    public function handle(TrendyolService $service, SyncRunService $runs): void
    {
        $runs->start($this->syncRun, $this->job?->uuid(), $this->attempts());
        $startedAt = microtime(true);
        $result = $service->pullOrders($this->account->fresh());
        Log::info('Trendyol order sync completed', ['account_id' => $this->account->id, 'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000)]);
        $runs->finish($this->syncRun, $result);
    }

    public function failed(Throwable $exception): void
    {
        app(SyncRunService::class)->fail($this->syncRun, $exception->getMessage());
        $this->account->update(['last_error' => $exception->getMessage()]);
    }
}
