<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QueueNotification extends Model
{
    protected $fillable = ['sync_run_id', 'level', 'title', 'message', 'payload', 'read_at'];

    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'read_at' => 'datetime',
        ];
    }

    public function syncRun(): BelongsTo
    {
        return $this->belongsTo(SyncRun::class);
    }
}
