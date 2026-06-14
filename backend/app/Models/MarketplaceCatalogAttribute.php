<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceCatalogAttribute extends Model
{
    protected $fillable = [
        'marketplace_code',
        'category_external_id',
        'external_id',
        'name',
        'required',
        'allow_custom',
        'value_type',
        'metadata',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'allow_custom' => 'boolean',
            'metadata' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }
}
