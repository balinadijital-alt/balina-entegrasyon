<?php

namespace App\Services\Shipping\Providers;

class YurticiCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'yurtici';
    }
}
