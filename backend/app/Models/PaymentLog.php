<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentLog extends Model
{
    protected $fillable = [
        'payment_id', 'payment_account_id', 'provider_code', 'event', 'status',
        'request_payload', 'response_payload', 'error_message', 'duration_ms',
    ];

    protected function casts(): array
    {
        return ['request_payload' => 'array', 'response_payload' => 'array'];
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class);
    }
}
