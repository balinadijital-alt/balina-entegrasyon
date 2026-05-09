<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ShippingCarrier extends Model
{
    protected $fillable = ['code', 'name', 'service_class', 'is_active', 'capabilities'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'capabilities' => 'array',
        ];
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(ShippingAccount::class);
    }
}
