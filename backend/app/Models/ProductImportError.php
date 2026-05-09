<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductImportError extends Model
{
    protected $fillable = [
        'product_import_run_id',
        'row_number',
        'sku',
        'barcode',
        'message',
        'payload',
    ];

    protected function casts(): array
    {
        return ['payload' => 'array'];
    }

    public function importRun(): BelongsTo
    {
        return $this->belongsTo(ProductImportRun::class, 'product_import_run_id');
    }
}
