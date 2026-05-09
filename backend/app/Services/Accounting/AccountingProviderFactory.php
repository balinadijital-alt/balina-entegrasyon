<?php

namespace App\Services\Accounting;

use App\Models\AccountingAccount;
use App\Services\Accounting\Contracts\AccountingProvider;
use RuntimeException;

class AccountingProviderFactory
{
    public function make(AccountingAccount $account): AccountingProvider
    {
        $class = $account->integration?->service_class;
        if (! $class || ! class_exists($class)) {
            throw new RuntimeException('Muhasebe servis sinifi bulunamadi.');
        }
        return app($class);
    }
}
