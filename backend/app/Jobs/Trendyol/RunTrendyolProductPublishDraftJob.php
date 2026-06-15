<?php

namespace App\Jobs\Trendyol;

use App\Models\MarketplacePublishDraft;
use App\Services\Marketplaces\MarketplacePublishService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Illuminate\Support\Facades\DB;

class RunTrendyolProductPublishDraftJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 240;
    public bool $failOnTimeout = true;

    public function __construct(public MarketplacePublishDraft $draft)
    {
        $this->onQueue('marketplace-sync');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("trendyol-publish-draft:{$this->draft->id}"))->expireAfter(900)->dontRelease()];
    }

    public function handle(MarketplacePublishService $service): void
    {
        $draft = DB::transaction(function () {
            $draft = MarketplacePublishDraft::query()->lockForUpdate()->find($this->draft->id);

            if (! $draft || $draft->status !== 'queued' || filled($draft->batch_request_id)) {
                return null;
            }

            $draft->update(['status' => 'running', 'last_run_at' => now(), 'error_message' => null]);

            return $draft->refresh();
        });

        if (! $draft) {
            return;
        }

        $service->runDraft($draft);
    }

    public function failed(\Throwable $exception): void
    {
        $this->draft->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'result_summary' => array_merge($this->draft->result_summary ?? [], [
                'message' => $exception->getMessage(),
                'failed_at' => now()->toISOString(),
            ]),
        ]);
    }
}
