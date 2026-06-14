<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MarketplaceCatalogAttributeValue extends Model
{
    protected $fillable = [
        'marketplace_code',
        'attribute_external_id',
        'category_external_id',
        'external_id',
        'name',
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
