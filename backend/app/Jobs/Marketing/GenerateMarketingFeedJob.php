<?php

namespace App\Jobs\Marketing;

use App\Models\Marketing\MarketingFeed;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class GenerateMarketingFeedJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $feedId) {}

    public function handle(): void
    {
        $feed = MarketingFeed::find($this->feedId);

        if (! $feed) {
            return;
        }

        $feed->update([
            'status' => 'generated',
            'settings' => array_merge($feed->settings ?? [], [
                'last_generated_at' => now()->toISOString(),
                'format' => $feed->provider === 'meta' ? 'catalog' : 'merchant',
            ]),
        ]);
    }
}
