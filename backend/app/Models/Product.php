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
        'xml_source_id',
        'parent_product_id',
        'source_product_code',
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
        'variant_group_key',
        'variant_options',
        'variant_attributes',
        'variant_sort_order',
        'trendyol_attributes',
        'hepsiburada_attributes',
        'tags',
        'attributes',
        'unit',
        'marketplace_readiness',
        'marketplace_ready',
        'trendyol_batch_request_id',
        'last_trendyol_sync_at',
        'last_import_run_id',
        'last_imported_at',
        'last_xml_sync_at',
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
            'variant_attributes' => 'array',
            'variant_sort_order' => 'integer',
            'trendyol_attributes' => 'array',
            'hepsiburada_attributes' => 'array',
            'tags' => 'array',
            'attributes' => 'array',
            'marketplace_readiness' => 'array',
            'marketplace_ready' => 'boolean',
            'last_trendyol_sync_at' => 'datetime',
            'last_imported_at' => 'datetime',
            'last_xml_sync_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function xmlSource(): BelongsTo
    {
        return $this->belongsTo(XmlSource::class);
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'parent_product_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(Product::class, 'parent_product_id')->orderBy('variant_sort_order')->orderBy('id');
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
