<?php

namespace App\Services\Payments\Providers;

class OfflinePaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'offline';
    }
}
