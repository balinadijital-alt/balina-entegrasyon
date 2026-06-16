<?php

namespace App\Jobs\Trendyol;

use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\TrendyolService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;

class SyncTrendyolShipmentPackagesJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 180;

    public function __construct(public MarketplaceAccount $account, public array $query = [], public bool $stream = false)
    {
        $this->onQueue('marketplace-sync');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("trendyol-shipment-packages:{$this->account->id}"))->expireAfter(900)->dontRelease()];
    }

    public function handle(TrendyolService $service): void
    {
        $account = $this->account->fresh();

        if ($this->stream) {
            $service->pullOrdersStream($account, $this->query);

            return;
        }

        $service->syncShipmentPackages($account, $this->query);
    }
}
