<?php

namespace App\Jobs\Trendyol;

use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\TrendyolService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

class SendProductsToTrendyolJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public MarketplaceAccount $account)
    {
        $this->onQueue('marketplace-sync');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function handle(TrendyolService $service): void
    {
        $service->sendProducts($this->account->fresh(['company.products.images']));
    }

    public function failed(Throwable $exception): void
    {
        $this->account->update(['last_error' => $exception->getMessage()]);
    }
}
