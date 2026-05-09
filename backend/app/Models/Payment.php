<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Payment extends Model
{
    protected $fillable = [
        'order_id', 'payment_account_id', 'provider_code', 'method', 'status', 'amount',
        'refunded_amount', 'installment_count', 'commission_rate', 'commission_amount',
        'currency', 'conversation_id', 'transaction_id', 'payment_url', 'three_d_html',
        'request_payload', 'response_payload', 'error_message', 'paid_at', 'failed_at',
    ];

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'refunded_amount' => 'decimal:2',
            'commission_rate' => 'decimal:4',
            'commission_amount' => 'decimal:2',
            'request_payload' => 'array',
            'response_payload' => 'array',
            'paid_at' => 'datetime',
            'failed_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(PaymentAccount::class, 'payment_account_id');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(PaymentLog::class);
    }
}
