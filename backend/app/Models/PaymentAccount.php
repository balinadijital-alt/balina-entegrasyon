<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PaymentAccount extends Model
{
    protected $fillable = [
        'company_id', 'payment_provider_id', 'name', 'merchant_id', 'api_key', 'api_secret',
        'client_id', 'client_secret', 'base_url', 'webhook_secret', 'installment_rates',
        'commission_rates', 'settings', 'is_active',
    ];

    protected $hidden = ['merchant_id', 'api_key', 'api_secret', 'client_id', 'client_secret', 'webhook_secret'];

    protected function casts(): array
    {
        return [
            'merchant_id' => 'encrypted',
            'api_key' => 'encrypted',
            'api_secret' => 'encrypted',
            'client_id' => 'encrypted',
            'client_secret' => 'encrypted',
            'webhook_secret' => 'encrypted',
            'installment_rates' => 'array',
            'commission_rates' => 'array',
            'settings' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function provider(): BelongsTo
    {
        return $this->belongsTo(PaymentProvider::class, 'payment_provider_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }
}
