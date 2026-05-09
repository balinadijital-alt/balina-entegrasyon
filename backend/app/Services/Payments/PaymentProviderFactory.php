<?php

namespace App\Services\Payments;

use App\Models\PaymentAccount;
use App\Services\Payments\Contracts\PaymentProvider;
use RuntimeException;

class PaymentProviderFactory
{
    public function make(PaymentAccount $account): PaymentProvider
    {
        $class = $account->provider?->service_class;

        if (! $class || ! class_exists($class)) {
            throw new RuntimeException('Odeme servis sinifi bulunamadi.');
        }

        return app($class);
    }
}
