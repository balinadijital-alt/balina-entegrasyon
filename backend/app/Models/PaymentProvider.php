<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentProvider extends Model
{
    protected $fillable = ['code', 'name', 'service_class', 'capabilities', 'is_active'];

    protected function casts(): array
    {
        return ['capabilities' => 'array', 'is_active' => 'boolean'];
    }

    public function accounts(): HasMany
    {
        return $this->hasMany(PaymentAccount::class);
    }
}
