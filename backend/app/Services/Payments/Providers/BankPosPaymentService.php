<?php

namespace App\Services\Payments\Providers;

class BankPosPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'bank_pos';
    }
}
