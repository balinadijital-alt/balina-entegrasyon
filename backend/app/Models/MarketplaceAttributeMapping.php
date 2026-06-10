<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceAttributeMapping extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'local_category_id',
        'marketplace_category_id',
        'marketplace_attribute_id',
        'marketplace_attribute_name',
        'required',
        'value_type',
        'source_type',
        'source_field',
        'fixed_value',
        'value_map',
        'status',
        'metadata',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'required' => 'boolean',
            'value_map' => 'array',
            'metadata' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
