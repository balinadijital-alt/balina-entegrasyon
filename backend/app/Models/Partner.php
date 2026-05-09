<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Partner extends Model
{
    protected $fillable = ['name', 'email', 'phone', 'code', 'commission_rate', 'status', 'metadata'];

    protected function casts(): array
    {
        return ['commission_rate' => 'decimal:4', 'metadata' => 'array'];
    }

    public function companies(): HasMany { return $this->hasMany(Company::class); }
}
