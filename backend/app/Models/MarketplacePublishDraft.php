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
        'operation_name',
        'operation_type',
        'schedule',
        'status',
        'product_ids',
        'mappings',
        'price_controls',
        'operation_filters',
        'readiness_report',
        'payload_preview',
        'result_summary',
        'batch_request_id',
        'error_message',
        'created_by',
        'sent_at',
        'last_run_at',
        'next_run_at',
    ];

    protected function casts(): array
    {
        return [
            'product_ids' => 'array',
            'mappings' => 'array',
            'price_controls' => 'array',
            'operation_filters' => 'array',
            'readiness_report' => 'array',
            'payload_preview' => 'array',
            'result_summary' => 'array',
            'sent_at' => 'datetime',
            'last_run_at' => 'datetime',
            'next_run_at' => 'datetime',
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
