<?php

namespace App\Jobs\Imports;

use App\Models\ProductImportRun;
use App\Services\Imports\ProductImportService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Throwable;

class ProcessProductImportJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 900;
    public bool $failOnTimeout = true;

    public function __construct(public ProductImportRun $run)
    {
        $this->onQueue('imports');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("product-import:{$this->run->id}"))->expireAfter(1200)->dontRelease()];
    }

    public function handle(ProductImportService $service): void
    {
        $service->process($this->run->fresh(['xmlSource']), $this->job?->uuid(), $this->attempts());
    }

    public function failed(Throwable $exception): void
    {
        $this->run->update([
            'status' => 'failed',
            'error_message' => $exception->getMessage(),
            'finished_at' => now(),
        ]);
    }
}
