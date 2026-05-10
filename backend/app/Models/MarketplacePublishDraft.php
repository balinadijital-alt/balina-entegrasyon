<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplacePublishDraft extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_account_id',
        'marketplace_code',
        'status',
        'product_ids',
        'mappings',
        'price_controls',
        'readiness_report',
        'payload_preview',
        'result_summary',
        'error_message',
        'created_by',
        'sent_at',
    ];

    protected function casts(): array
    {
        return [
            'product_ids' => 'array',
            'mappings' => 'array',
            'price_controls' => 'array',
            'readiness_report' => 'array',
            'payload_preview' => 'array',
            'result_summary' => 'array',
            'sent_at' => 'datetime',
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

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
