<?php

namespace App\Services\Shipping\Providers;

class PttCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'ptt';
    }
}
