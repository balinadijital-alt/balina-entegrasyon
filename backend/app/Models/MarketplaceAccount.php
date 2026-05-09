<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MarketplaceAccount extends Model
{
    protected $fillable = [
        'company_id',
        'code',
        'name',
        'supplier_id',
        'merchant_id',
        'api_key',
        'api_secret',
        'is_active',
    ];

    protected $hidden = ['api_key', 'api_secret'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }
}
