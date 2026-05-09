<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SyncRun extends Model
{
    protected $fillable = [
        'marketplace_account_id',
        'type',
        'queue',
        'job_uuid',
        'status',
        'attempts',
        'duration_ms',
        'processed_count',
        'message',
        'error_message',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function marketplace(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class, 'marketplace_account_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(QueueNotification::class);
    }
}
