<?php

namespace App\Services\Shipping\Providers;

class ArasCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'aras';
    }
}
