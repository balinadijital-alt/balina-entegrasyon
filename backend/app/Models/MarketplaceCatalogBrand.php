<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceCatalogBrand extends Model
{
    protected $fillable = [
        'marketplace_code',
        'external_id',
        'name',
        'normalized_name',
        'metadata',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }
}
