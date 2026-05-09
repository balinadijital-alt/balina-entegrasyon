<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceAccount extends Model
{
    protected $fillable = [
        'company_id',
        'code',
        'name',
        'supplier_id',
        'merchant_id',
        'api_key',
        'api_secret',
        'is_active',
        'connection_status',
        'connection_checked_at',
        'last_product_sync_at',
        'last_price_sync_at',
        'last_order_sync_at',
        'last_error',
        'metadata',
    ];

    protected $hidden = ['api_key', 'api_secret'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
            'connection_checked_at' => 'datetime',
            'last_product_sync_at' => 'datetime',
            'last_price_sync_at' => 'datetime',
            'last_order_sync_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
