<?php

namespace App\Jobs\Hepsiburada;

use App\Models\MarketplaceAccount;
use App\Models\SyncRun;
use App\Services\Marketplaces\HepsiburadaService;
use App\Services\Queue\SyncRunService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\Log;
use Throwable;

class SendProductsToHepsiburadaJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 240;
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
        return [(new WithoutOverlapping("hepsiburada-products:{$this->account->id}"))->expireAfter(900)->dontRelease()];
    }

    public function handle(HepsiburadaService $service, SyncRunService $runs): void
    {
        $runs->start($this->syncRun, $this->job?->uuid(), $this->attempts());
        $startedAt = microtime(true);
        $result = $service->sendProducts($this->account->fresh(['company.products.images']));
        Log::info('Hepsiburada product sync completed', ['account_id' => $this->account->id, 'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000)]);
        $runs->finish($this->syncRun, $result);
    }

    public function failed(Throwable $exception): void
    {
        app(SyncRunService::class)->fail($this->syncRun, $exception->getMessage());
        $this->account->update(['last_error' => $exception->getMessage()]);
    }
}
