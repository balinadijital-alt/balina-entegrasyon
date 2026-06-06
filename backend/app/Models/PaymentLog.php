<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentLog extends Model
{
    protected $fillable = [
        'payment_id', 'payment_account_id', 'provider_code', 'event', 'status',
        'request_payload', 'response_payload', 'error_message', 'duration_ms',
        'request_id', 'correlation_id', 'idempotency_key', 'signature_valid', 'provider_timestamp',
    ];

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'response_payload' => 'array',
            'signature_valid' => 'boolean',
            'provider_timestamp' => 'datetime',
        ];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
