<?php

namespace App\Http\Controllers;

use App\Models\Invoice;
use App\Models\Order;
use App\Models\Payment;
use App\Models\ProductImportRun;
use App\Models\Shipment;
use App\Models\XmlSource;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

abstract class Controller
{
    protected function isSuperAdmin(Request $request): bool
    {
        return (bool) $request->user()?->hasRole('super_admin');
    }

    protected function currentCompanyId(Request $request): ?int
    {
        return $this->isSuperAdmin($request) ? null : (int) $request->user()?->company_id;
    }

    protected function tenantCompanyId(Request $request): ?int
    {
        return $this->currentCompanyId($request);
    }

    protected function abortIfNotTenant(Request $request, Model $model): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $model->getAttribute('company_id') !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }

    protected function abortIfOrderNotTenant(Request $request, Order $order): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $order->company_id !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }

    protected function abortIfPaymentNotTenant(Request $request, Payment $payment): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $payment->order()->value('company_id') !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }

    protected function abortIfShipmentNotTenant(Request $request, Shipment $shipment): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $shipment->order()->value('company_id') !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }

    protected function abortIfInvoiceNotTenant(Request $request, Invoice $invoice): void
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId && (int) $invoice->company_id !== $companyId) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }
    }

    protected function abortIfAccountNotTenant(Request $request, Model $account): void
    {
        $this->abortIfNotTenant($request, $account);
    }

    protected function abortIfImportRunNotTenant(Request $request, ProductImportRun $run): void
    {
        $this->abortIfNotTenant($request, $run);
    }

    protected function abortIfXmlSourceNotTenant(Request $request, XmlSource $source): void
    {
        $this->abortIfNotTenant($request, $source);
    }

    protected function forceTenantCompany(Request $request, array $data): array
    {
        $companyId = $this->tenantCompanyId($request);

        if ($companyId) {
            $data['company_id'] = $companyId;
        }

        return $data;
    }
}
