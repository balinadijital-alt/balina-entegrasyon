<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invoice extends Model
{
    protected $fillable = ['company_id', 'order_id', 'current_account_id', 'accounting_account_id', 'type', 'scenario', 'status', 'invoice_number', 'external_id', 'subtotal', 'tax_total', 'grand_total', 'currency', 'lines', 'request_payload', 'response_payload', 'pdf_path', 'pdf_url', 'error_message', 'issued_at'];

    protected function casts(): array
    {
        return [
            'subtotal' => 'decimal:2', 'tax_total' => 'decimal:2', 'grand_total' => 'decimal:2',
            'lines' => 'array', 'request_payload' => 'array', 'response_payload' => 'array', 'issued_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
    public function currentAccount(): BelongsTo { return $this->belongsTo(CurrentAccount::class); }
    public function account(): BelongsTo { return $this->belongsTo(AccountingAccount::class, 'accounting_account_id'); }
}
