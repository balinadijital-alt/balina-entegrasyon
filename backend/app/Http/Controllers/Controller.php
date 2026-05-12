<?php

namespace App\Http\Controllers;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function tenantCompanyId(Request $request): ?int
    {
        return $request->user()?->hasRole('super_admin') ? null : (int) $request->user()?->company_id;
    }

    protected function abortIfNotTenant(Request $request, Model $model): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $model->getAttribute('company_id') !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }
}
