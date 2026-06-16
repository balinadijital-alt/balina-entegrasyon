<?php

namespace App\Models;

use App\Models\Workflow\OrderNote;
use App\Models\Workflow\OrderOperationHistory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'company_id',
        'marketplace_account_id',
        'marketplace_code',
        'marketplace_order_id',
        'provider_order_number',
        'provider_shipment_package_id',
        'provider_package_status',
        'provider_status',
        'cargo_provider_id',
        'cargo_provider_name',
        'cargo_tracking_number',
        'customer_name',
        'customer_email',
        'customer_phone',
        'shipping_address',
        'billing_address',
        'total_amount',
        'status',
        'payment_status',
        'shipping_status',
        'invoice_status',
        'cancel_reason',
        'return_reason',
        'problem_note',
        'operation_flags',
        'payload',
        'provider_payload',
        'last_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'total_amount' => 'decimal:2',
            'shipping_address' => 'array',
            'billing_address' => 'array',
            'operation_flags' => 'array',
            'payload' => 'array',
            'provider_payload' => 'array',
            'last_synced_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function marketplaceAccount(): BelongsTo
    {
        return $this->belongsTo(MarketplaceAccount::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function marketplaceOperations(): HasMany
    {
        return $this->hasMany(MarketplaceOrderOperation::class)->latest();
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

    public function notes(): HasMany
    {
        return $this->hasMany(OrderNote::class)->latest();
    }

    public function operationHistories(): HasMany
    {
        return $this->hasMany(OrderOperationHistory::class)->latest();
    }
}
