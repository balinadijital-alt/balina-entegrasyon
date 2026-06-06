<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InboundWebhookDelivery extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_account_id',
        'marketplace_code',
        'delivery_id',
        'idempotency_key',
        'event',
        'status',
        'payload',
        'signature_valid',
        'processed_at',
        'last_error',
        'request_id',
        'correlation_id',
        'business_event_key',
        'body_sha256',
        'source_ip',
        'user_agent',
        'provider_timestamp',
        'received_at',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'signature_valid' => 'boolean',
            'processed_at' => 'datetime',
            'provider_timestamp' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }
}
