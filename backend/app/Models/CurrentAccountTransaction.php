<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CurrentAccountTransaction extends Model
{
    protected $fillable = ['current_account_id', 'order_id', 'type', 'direction', 'amount', 'currency', 'description', 'transaction_date', 'payload'];

    protected function casts(): array
    {
        return ['amount' => 'decimal:2', 'transaction_date' => 'datetime', 'payload' => 'array'];
    }

    public function currentAccount(): BelongsTo { return $this->belongsTo(CurrentAccount::class); }
    public function order(): BelongsTo { return $this->belongsTo(Order::class); }
}
