<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UsageCounter extends Model
{
    protected $fillable = ['company_id', 'metric', 'used', 'limit', 'period_starts_at', 'period_ends_at'];

    protected function casts(): array
    {
        return ['period_starts_at' => 'datetime', 'period_ends_at' => 'datetime'];
    }

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
}
