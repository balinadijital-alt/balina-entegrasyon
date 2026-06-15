<?php

namespace App\Console\Commands;

use App\Services\Marketplaces\MarketplacePublishService;
use Illuminate\Console\Command;

class DispatchDueMarketplacePublishDrafts extends Command
{
    protected $signature = 'marketplace:dispatch-due-publish-drafts';

    protected $description = 'Dispatch due scheduled marketplace product publish drafts.';

    public function handle(MarketplacePublishService $service): int
    {
        $count = $service->dispatchDueScheduledDrafts();
        $this->info("Queued {$count} scheduled marketplace publish draft(s).");

        return self::SUCCESS;
    }
}
