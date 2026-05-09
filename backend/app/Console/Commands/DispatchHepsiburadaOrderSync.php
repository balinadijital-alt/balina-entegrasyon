<?php

namespace App\Console\Commands;

use App\Jobs\Hepsiburada\PullHepsiburadaOrdersJob;
use App\Models\MarketplaceAccount;
use App\Services\Queue\SyncRunService;
use Illuminate\Console\Command;
use RuntimeException;

class DispatchHepsiburadaOrderSync extends Command
{
    protected $signature = 'hepsiburada:sync-orders';

    protected $description = 'Dispatch automatic Hepsiburada order sync jobs for active accounts.';

    public function handle(SyncRunService $runs): int
    {
        MarketplaceAccount::where('code', 'hepsiburada')->where('is_active', true)->each(function (MarketplaceAccount $account) use ($runs) {
            try {
                $syncRun = $runs->create($account, 'hepsiburada_orders');
                PullHepsiburadaOrdersJob::dispatch($account, $syncRun);
                $this->info("Queued Hepsiburada order sync for account {$account->id}");
            } catch (RuntimeException $exception) {
                $this->warn($exception->getMessage());
            }
        });

        return self::SUCCESS;
    }
}
