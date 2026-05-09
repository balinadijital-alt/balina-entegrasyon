<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CategoryMapping extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'local_category',
        'external_category_id',
        'external_category_name',
        'attributes',
    ];

    protected function casts(): array
    {
        return ['attributes' => 'array'];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
