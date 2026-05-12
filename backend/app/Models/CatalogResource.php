<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CatalogResource extends Model
{
    protected $fillable = [
        'company_id',
        'parent_id',
        'type',
        'name',
        'code',
        'description',
        'image_url',
        'values',
        'settings',
        'sort_order',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'values' => 'array',
            'settings' => 'array',
            'sort_order' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(self::class, 'parent_id')->orderBy('sort_order')->orderBy('name');
    }
}
