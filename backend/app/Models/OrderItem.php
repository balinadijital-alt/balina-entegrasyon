<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class OrderItem extends Model
{
    protected $fillable = [
        'order_id',
        'marketplace_account_id',
        'marketplace_code',
        'provider_line_id',
        'barcode',
        'sku',
        'name',
        'quantity',
        'unit_price',
        'provider_status',
        'cancel_reason_id',
        'provider_payload',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'unit_price' => 'decimal:2',
            'provider_payload' => 'array',
        ];
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function operations(): HasMany
    {
        return $this->hasMany(MarketplaceOrderOperation::class);
    }
}
