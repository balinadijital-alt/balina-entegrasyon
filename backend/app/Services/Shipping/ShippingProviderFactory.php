<?php

namespace App\Services\Shipping;

use App\Models\ShippingAccount;
use App\Services\Shipping\Contracts\ShippingProvider;
use RuntimeException;

class ShippingProviderFactory
{
    public function make(ShippingAccount $account): ShippingProvider
    {
        $class = $account->carrier?->service_class;

        if (! $class || ! class_exists($class)) {
            throw new RuntimeException('Kargo servis sinifi bulunamadi.');
        }

        return app($class);
    }
}
