<?php

namespace App\Services\Shipping\Providers;

class MngCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'mng';
    }
}
