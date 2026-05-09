<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SaasPlan extends Model
{
    protected $fillable = ['code', 'name', 'monthly_price', 'limits', 'features', 'is_active'];

    protected function casts(): array
    {
        return ['monthly_price' => 'decimal:2', 'limits' => 'array', 'features' => 'array', 'is_active' => 'boolean'];
    }
}
