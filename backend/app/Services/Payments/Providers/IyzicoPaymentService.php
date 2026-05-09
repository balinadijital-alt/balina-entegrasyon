<?php

namespace App\Services\Payments\Providers;

class IyzicoPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'iyzico';
    }
}
