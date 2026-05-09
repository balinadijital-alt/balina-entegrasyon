<?php

namespace App\Console\Commands;

use App\Jobs\Trendyol\UpdateTrendyolPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Queue\SyncRunService;
use Illuminate\Console\Command;
use RuntimeException;

class DispatchTrendyolPriceInventorySync extends Command
{
    protected $signature = 'trendyol:sync-price-inventory';

    protected $description = 'Dispatch automatic Trendyol stock and price sync jobs for active accounts.';

    public function handle(SyncRunService $runs): int
    {
        MarketplaceAccount::where('code', 'trendyol')->where('is_active', true)->each(function (MarketplaceAccount $account) use ($runs) {
            try {
                $syncRun = $runs->create($account, 'trendyol_price_inventory');
                UpdateTrendyolPriceInventoryJob::dispatch($account, $syncRun);
                $this->info("Queued stock/price sync for account {$account->id}");
            } catch (RuntimeException $exception) {
                $this->warn($exception->getMessage());
            }
        });

        return self::SUCCESS;
    }
}
