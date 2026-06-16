<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketplaceReturnClaim extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'marketplace_code',
        'provider_claim_id',
        'provider_order_number',
        'provider_shipment_package_id',
        'status',
        'customer_masked',
        'claim_date',
        'last_synced_at',
        'provider_payload',
    ];

    protected function casts(): array
    {
        return [
            'claim_date' => 'datetime',
            'last_synced_at' => 'datetime',
            'provider_payload' => 'array',
        ];
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(MarketplaceReturnClaimItem::class);
    }

    public function operations(): HasMany
    {
        return $this->hasMany(MarketplaceReturnOperation::class);
    }
}
