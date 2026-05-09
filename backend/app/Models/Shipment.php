<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Shipment extends Model
{
    protected $fillable = [
        'order_id',
        'shipping_account_id',
        'carrier_code',
        'status',
        'barcode',
        'tracking_number',
        'label_path',
        'label_url',
        'return_code',
        'last_action',
        'request_payload',
        'response_payload',
        'error_message',
        'shipped_at',
        'delivered_at',
    ];

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'response_payload' => 'array',
            'shipped_at' => 'datetime',
            'delivered_at' => 'datetime',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(ShippingAccount::class, 'shipping_account_id');
    }
}
