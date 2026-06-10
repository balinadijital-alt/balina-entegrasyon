<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceVariantAttributeMapping extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'variant_key',
        'marketplace_attribute_id',
        'marketplace_attribute_name',
        'source_type',
        'source_field',
        'value_map',
        'status',
        'metadata',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'value_map' => 'array',
            'metadata' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
