<?php

namespace App\Jobs\Payments;

use App\Models\Payment;
use App\Services\Payments\PaymentProviderFactory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Throwable;

class CheckPaymentStatusJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 120;
    public bool $failOnTimeout = true;

    public function __construct(public Payment $payment)
    {
        $this->onQueue('payments');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("payment-query:{$this->payment->id}"))->expireAfter(300)->dontRelease()];
    }

    public function handle(PaymentProviderFactory $factory): void
    {
        $payment = $this->payment->fresh(['account.provider', 'order']);
        $result = $factory->make($payment->account)->query($payment);
        $payment->update(array_filter($result, fn ($value) => $value !== null));
    }

    public function failed(Throwable $exception): void
    {
        $this->payment->update(['error_message' => $exception->getMessage()]);
    }
}
