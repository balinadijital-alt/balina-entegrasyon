<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    use HasFactory;

    protected $fillable = [
        'company_id',
        'supplier_name',
        'sku',
        'barcode',
        'name',
        'description',
        'brand',
        'trendyol_brand_id',
        'category',
        'trendyol_category_id',
        'price',
        'list_price',
        'stock',
        'vat_rate',
        'dimensional_weight',
        'variant_group',
        'variant_options',
        'trendyol_attributes',
        'trendyol_batch_request_id',
        'last_trendyol_sync_at',
        'last_import_run_id',
        'last_imported_at',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'price' => 'decimal:2',
            'list_price' => 'decimal:2',
            'stock' => 'integer',
            'vat_rate' => 'integer',
            'dimensional_weight' => 'decimal:2',
            'variant_options' => 'array',
            'trendyol_attributes' => 'array',
            'last_trendyol_sync_at' => 'datetime',
            'last_imported_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }
}
