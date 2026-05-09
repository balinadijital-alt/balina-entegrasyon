<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShippingAccount extends Model
{
    protected $fillable = [
        'company_id',
        'shipping_carrier_id',
        'name',
        'customer_code',
        'username',
        'password',
        'api_key',
        'api_secret',
        'base_url',
        'settings',
        'last_status',
        'last_error',
        'last_checked_at',
        'is_active',
    ];

    protected $hidden = ['username', 'password', 'api_key', 'api_secret'];

    protected function casts(): array
    {
        return [
            'username' => 'encrypted',
            'password' => 'encrypted',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
            'settings' => 'array',
            'last_checked_at' => 'datetime',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function carrier(): BelongsTo
    {
        return $this->belongsTo(ShippingCarrier::class, 'shipping_carrier_id');
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class);
    }
}
