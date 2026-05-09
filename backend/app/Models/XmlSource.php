<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class XmlSource extends Model
{
    protected $fillable = [
        'company_id',
        'name',
        'supplier_name',
        'url',
        'username',
        'password',
        'frequency_minutes',
        'field_mapping',
        'options',
        'last_status',
        'last_error',
        'last_import_at',
        'is_active',
    ];

    protected $hidden = ['username', 'password'];

    protected function casts(): array
    {
        return [
            'username' => 'encrypted',
            'password' => 'encrypted',
            'frequency_minutes' => 'integer',
            'field_mapping' => 'array',
            'options' => 'array',
            'last_import_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function importRuns(): HasMany
    {
        return $this->hasMany(ProductImportRun::class);
    }
}
