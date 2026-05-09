<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AccountingLog extends Model
{
    protected $fillable = ['accounting_account_id', 'invoice_id', 'provider_code', 'event', 'status', 'request_payload', 'response_payload', 'error_message', 'duration_ms'];

    protected function casts(): array
    {
        return ['request_payload' => 'array', 'response_payload' => 'array'];
    }
}
