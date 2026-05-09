<?php

namespace App\Console\Commands;

use App\Models\ApiLog;
use App\Models\AccountingLog;
use App\Models\PaymentLog;
use Illuminate\Console\Command;

class PruneApplicationLogs extends Command
{
    protected $signature = 'balina:prune-logs {--days=30}';

    protected $description = 'Prune old application logs for operational hygiene.';

    public function handle(): int
    {
        $before = now()->subDays((int) $this->option('days'));
        $deleted = ApiLog::where('created_at', '<', $before)->delete()
            + PaymentLog::where('created_at', '<', $before)->delete()
            + AccountingLog::where('created_at', '<', $before)->delete();
        $this->info("Silinen log sayisi: {$deleted}");

        return self::SUCCESS;
    }
}
