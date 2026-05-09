<?php

namespace App\Services\Payments\Providers;

class PaynetPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'paynet';
    }
}
