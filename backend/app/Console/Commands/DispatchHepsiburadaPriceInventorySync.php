<?php

namespace App\Console\Commands;

use App\Jobs\Hepsiburada\UpdateHepsiburadaPriceInventoryJob;
use App\Models\MarketplaceAccount;
use App\Services\Queue\SyncRunService;
use Illuminate\Console\Command;
use RuntimeException;

class DispatchHepsiburadaPriceInventorySync extends Command
{
    protected $signature = 'hepsiburada:sync-price-inventory';

    protected $description = 'Dispatch automatic Hepsiburada stock and price sync jobs for active accounts.';

    public function handle(SyncRunService $runs): int
    {
        MarketplaceAccount::where('code', 'hepsiburada')->where('is_active', true)->each(function (MarketplaceAccount $account) use ($runs) {
            try {
                $syncRun = $runs->create($account, 'hepsiburada_price_inventory');
                UpdateHepsiburadaPriceInventoryJob::dispatch($account, $syncRun);
                $this->info("Queued Hepsiburada stock/price sync for account {$account->id}");
            } catch (RuntimeException $exception) {
                $this->warn($exception->getMessage());
            }
        });

        return self::SUCCESS;
    }
}
