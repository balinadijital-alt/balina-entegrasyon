<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceCatalogCategory extends Model
{
    protected $fillable = [
        'marketplace_code',
        'external_id',
        'parent_external_id',
        'name',
        'path',
        'level',
        'is_leaf',
        'metadata',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'is_leaf' => 'boolean',
            'metadata' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }
}
