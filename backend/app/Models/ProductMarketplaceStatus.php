<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductMarketplaceStatus extends Model
{
    protected $fillable = [
        'product_id',
        'marketplace_code',
        'status',
        'readiness_status',
        'missing_fields',
        'external_product_id',
        'batch_request_id',
        'last_payload',
        'last_response',
        'error_message',
        'last_checked_at',
        'last_sent_at',
    ];

    protected function casts(): array
    {
        return [
            'missing_fields' => 'array',
            'last_payload' => 'array',
            'last_response' => 'array',
            'last_checked_at' => 'datetime',
            'last_sent_at' => 'datetime',
        ];
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
