<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceBrandMapping extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'local_brand_id',
        'local_brand_name',
        'marketplace_brand_id',
        'marketplace_brand_name',
        'confidence',
        'status',
        'metadata',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return ['metadata' => 'array'];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
