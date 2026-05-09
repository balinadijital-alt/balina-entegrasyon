<?php

namespace App\Jobs\Accounting;

use App\Models\Invoice;
use App\Services\Accounting\AccountingProviderFactory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Throwable;

class ProcessInvoiceJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 180;
    public bool $failOnTimeout = true;

    public function __construct(public Invoice $invoice, public string $action = 'create')
    {
        $this->onQueue('accounting');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("invoice:{$this->invoice->id}:{$this->action}"))->expireAfter(600)->dontRelease()];
    }

    public function handle(AccountingProviderFactory $factory): void
    {
        $invoice = $this->invoice->fresh(['account.integration', 'currentAccount', 'order']);
        $provider = $factory->make($invoice->account);
        $invoice->update(['status' => 'processing', 'error_message' => null]);
        $result = match ($this->action) {
            'return' => $provider->createReturnInvoice($invoice),
            'query' => $provider->queryStatus($invoice),
            'pdf' => $provider->createPdf($invoice),
            default => $provider->createInvoice($invoice),
        };
        $invoice->update(array_filter($result, fn ($value) => $value !== null));
    }

    public function failed(Throwable $exception): void
    {
        $this->invoice->update(['status' => 'failed', 'error_message' => $exception->getMessage()]);
    }
}
