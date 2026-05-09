<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_code',
        'marketplace_order_id',
        'customer_name',
        'customer_email',
        'total_amount',
        'status',
        'payload',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'payload' => 'array',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function shipments(): HasMany
    {
        return $this->hasMany(Shipment::class)->latest();
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class)->latest();
    }

    public function currentTransactions(): HasMany
    {
        return $this->hasMany(CurrentAccountTransaction::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class)->latest();
    }
}
