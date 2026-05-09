<?php

namespace App\Console\Commands;

use App\Jobs\Trendyol\PullTrendyolOrdersJob;
use App\Models\MarketplaceAccount;
use App\Services\Queue\SyncRunService;
use Illuminate\Console\Command;
use RuntimeException;

class DispatchTrendyolOrderSync extends Command
{
    protected $signature = 'trendyol:sync-orders';

    protected $description = 'Dispatch automatic Trendyol order sync jobs for active accounts.';

    public function handle(SyncRunService $runs): int
    {
        MarketplaceAccount::where('code', 'trendyol')->where('is_active', true)->each(function (MarketplaceAccount $account) use ($runs) {
            try {
                $syncRun = $runs->create($account, 'trendyol_orders');
                PullTrendyolOrdersJob::dispatch($account, $syncRun);
                $this->info("Queued order sync for account {$account->id}");
            } catch (RuntimeException $exception) {
                $this->warn($exception->getMessage());
            }
        });

        return self::SUCCESS;
    }
}
