<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class MarketplaceReturnClaimItem extends Model
{
    protected $fillable = [
        'marketplace_return_claim_id',
        'marketplace_account_id',
        'product_id',
        'order_item_id',
        'provider_claim_line_item_id',
        'barcode',
        'sku',
        'quantity',
        'status',
        'reason_id',
        'reason_name',
        'provider_payload',
    ];

    protected function casts(): array
    {
        return [
            'quantity' => 'integer',
            'provider_payload' => 'array',
        ];
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketplaceReturnClaim::class, 'marketplace_return_claim_id');
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function operations(): HasMany
    {
        return $this->hasMany(MarketplaceReturnOperation::class);
    }
}
