<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceReturnOperation extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'marketplace_code',
        'marketplace_return_claim_id',
        'marketplace_return_claim_item_id',
        'operation_type',
        'request_payload',
        'response_payload',
        'status',
        'error_code',
        'error_message',
    ];

    protected function casts(): array
    {
        return [
            'request_payload' => 'array',
            'response_payload' => 'array',
        ];
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function claim(): BelongsTo
    {
        return $this->belongsTo(MarketplaceReturnClaim::class, 'marketplace_return_claim_id');
    }

    public function item(): BelongsTo
    {
        return $this->belongsTo(MarketplaceReturnClaimItem::class, 'marketplace_return_claim_item_id');
    }
}
