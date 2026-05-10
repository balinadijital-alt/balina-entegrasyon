<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

abstract class ModuleRecord extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'settings' => 'array',
            'rules' => 'array',
            'items' => 'array',
            'values' => 'array',
            'options' => 'array',
            'costs' => 'array',
            'filters' => 'array',
            'payload' => 'array',
            'xml_settings' => 'array',
            'variables' => 'array',
            'is_active' => 'boolean',
            'is_required' => 'boolean',
            'free_shipping' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'published_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'recovered_at' => 'datetime',
            'fetched_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
