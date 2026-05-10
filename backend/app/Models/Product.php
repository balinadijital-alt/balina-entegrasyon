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
        'product_type',
        'short_description',
        'description',
        'seo_title',
        'seo_description',
        'brand',
        'trendyol_brand_id',
        'category',
        'trendyol_category_id',
        'hepsiburada_category_id',
        'purchase_price',
        'price',
        'list_price',
        'stock',
        'critical_stock',
        'vat_rate',
        'dimensional_weight',
        'weight',
        'shipping_type',
        'main_image_url',
        'gallery_images',
        'video_url',
        'variant_group',
        'variant_options',
        'trendyol_attributes',
        'hepsiburada_attributes',
        'marketplace_readiness',
        'marketplace_ready',
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
            'purchase_price' => 'decimal:2',
            'stock' => 'integer',
            'critical_stock' => 'integer',
            'vat_rate' => 'integer',
            'dimensional_weight' => 'decimal:2',
            'weight' => 'decimal:2',
            'gallery_images' => 'array',
            'variant_options' => 'array',
            'trendyol_attributes' => 'array',
            'hepsiburada_attributes' => 'array',
            'marketplace_readiness' => 'array',
            'marketplace_ready' => 'boolean',
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

    public function marketplaceStatuses(): HasMany
    {
        return $this->hasMany(ProductMarketplaceStatus::class);
    }
}
