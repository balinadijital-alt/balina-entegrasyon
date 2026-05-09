<?php

namespace App\Services\Payments\Providers;

class ParamPaymentService extends AbstractPaymentService
{
    protected function code(): string
    {
        return 'param';
    }
}
