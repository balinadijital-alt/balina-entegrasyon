<?php

namespace App\Services\Accounting\Contracts;

use App\Models\Invoice;

interface AccountingProvider
{
    public function createInvoice(Invoice $invoice): array;
    public function createReturnInvoice(Invoice $invoice): array;
    public function queryStatus(Invoice $invoice): array;
    public function createPdf(Invoice $invoice): array;
}
