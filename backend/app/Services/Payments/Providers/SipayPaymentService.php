<?php

namespace App\Services\Payments\Providers;

class SipayPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'sipay';
    }
}
