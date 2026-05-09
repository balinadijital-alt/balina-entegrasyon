<?php

namespace App\Services\Shipping\Providers;

class SuratCargoService extends AbstractCargoService
{
    protected function code(): string
    {
        return 'surat';
    }
}
