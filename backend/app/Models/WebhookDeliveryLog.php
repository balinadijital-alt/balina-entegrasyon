<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WebhookDeliveryLog extends Model
{
    protected $fillable = [
        'company_id',
        'delivery_id',
        'event',
        'endpoint',
        'payload',
        'response_code',
        'response_body',
        'status',
        'success',
        'attempts',
        'delivered_at',
        'failed_at',
        'last_error',
    ];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'response_body' => 'array',
            'success' => 'boolean',
            'delivered_at' => 'datetime',
            'failed_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
