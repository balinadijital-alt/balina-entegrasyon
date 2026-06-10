<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceCategoryMapping extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'local_category_id',
        'local_category_name',
        'marketplace_category_id',
        'marketplace_category_name',
        'marketplace_category_path',
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
