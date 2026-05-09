<?php

namespace App\Services\Shipping\Providers;

class HepsijetCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'hepsijet';
    }
}
