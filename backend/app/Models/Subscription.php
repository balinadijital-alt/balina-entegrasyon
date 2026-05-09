<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Subscription extends Model
{
    protected $fillable = ['company_id', 'saas_plan_id', 'payment_id', 'status', 'trial_ends_at', 'starts_at', 'ends_at', 'cancelled_at', 'metadata'];

    protected function casts(): array
    {
        return ['trial_ends_at' => 'datetime', 'starts_at' => 'datetime', 'ends_at' => 'datetime', 'cancelled_at' => 'datetime', 'metadata' => 'array'];
    }

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function plan(): BelongsTo { return $this->belongsTo(SaasPlan::class, 'saas_plan_id'); }
    public function payment(): BelongsTo { return $this->belongsTo(Payment::class); }
}
