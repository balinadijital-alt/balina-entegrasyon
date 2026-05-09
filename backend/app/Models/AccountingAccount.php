<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountingAccount extends Model
{
    protected $fillable = ['company_id', 'accounting_integration_id', 'name', 'client_id', 'client_secret', 'username', 'password', 'api_key', 'api_secret', 'base_url', 'settings', 'is_active'];

    protected $hidden = ['client_id', 'client_secret', 'username', 'password', 'api_key', 'api_secret'];

    protected function casts(): array
    {
        return [
            'client_id' => 'encrypted',
            'client_secret' => 'encrypted',
            'username' => 'encrypted',
            'password' => 'encrypted',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
            'settings' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo { return $this->belongsTo(Company::class); }
    public function integration(): BelongsTo { return $this->belongsTo(AccountingIntegration::class, 'accounting_integration_id'); }
}
