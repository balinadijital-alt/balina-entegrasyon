<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CurrentAccount extends Model
{
    protected $fillable = ['company_id', 'type', 'name', 'code', 'email', 'phone', 'tax_office', 'tax_number', 'identity_number', 'address', 'city', 'district', 'balance', 'is_active'];

    protected function casts(): array
    {
        return ['balance' => 'decimal:2', 'is_active' => 'boolean'];
    }

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function transactions(): HasMany { return $this->hasMany(CurrentAccountTransaction::class); }
}
