<?php

namespace App\Services\Payments\Providers;

class PaytrPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'paytr';
    }
}
