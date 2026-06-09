<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        $this->addColumnIfMissing('supplier_name', fn (Blueprint $table) => $table->string('supplier_name')->nullable());
        $this->addColumnIfMissing('xml_source_id', fn (Blueprint $table) => $table->unsignedBigInteger('xml_source_id')->nullable());
        $this->addColumnIfMissing('parent_product_id', fn (Blueprint $table) => $table->unsignedBigInteger('parent_product_id')->nullable());
        $this->addColumnIfMissing('source_product_code', fn (Blueprint $table) => $table->string('source_product_code')->nullable());
        $this->addColumnIfMissing('sku', fn (Blueprint $table) => $table->string('sku')->nullable());
        $this->addColumnIfMissing('barcode', fn (Blueprint $table) => $table->string('barcode')->nullable());
        $this->addColumnIfMissing('name', fn (Blueprint $table) => $table->string('name')->nullable());
        $this->addColumnIfMissing('product_type', fn (Blueprint $table) => $table->string('product_type', 80)->default('standard'));
        $this->addColumnIfMissing('short_description', fn (Blueprint $table) => $table->text('short_description')->nullable());
        $this->addColumnIfMissing('description', fn (Blueprint $table) => $table->text('description')->nullable());
        $this->addColumnIfMissing('seo_title', fn (Blueprint $table) => $table->string('seo_title')->nullable());
        $this->addColumnIfMissing('seo_description', fn (Blueprint $table) => $table->text('seo_description')->nullable());
        $this->addColumnIfMissing('brand', fn (Blueprint $table) => $table->string('brand')->nullable());
        $this->addColumnIfMissing('trendyol_brand_id', fn (Blueprint $table) => $table->unsignedBigInteger('trendyol_brand_id')->nullable());
        $this->addColumnIfMissing('category', fn (Blueprint $table) => $table->string('category')->nullable());
        $this->addColumnIfMissing('trendyol_category_id', fn (Blueprint $table) => $table->unsignedBigInteger('trendyol_category_id')->nullable());
        $this->addColumnIfMissing('hepsiburada_category_id', fn (Blueprint $table) => $table->string('hepsiburada_category_id')->nullable());
        $this->addColumnIfMissing('purchase_price', fn (Blueprint $table) => $table->decimal('purchase_price', 12, 2)->nullable());
        $this->addColumnIfMissing('price', fn (Blueprint $table) => $table->decimal('price', 12, 2)->default(0));
        $this->addColumnIfMissing('list_price', fn (Blueprint $table) => $table->decimal('list_price', 12, 2)->nullable());
        $this->addColumnIfMissing('stock', fn (Blueprint $table) => $table->unsignedInteger('stock')->default(0));
        $this->addColumnIfMissing('critical_stock', fn (Blueprint $table) => $table->unsignedInteger('critical_stock')->default(0));
        $this->addColumnIfMissing('vat_rate', fn (Blueprint $table) => $table->unsignedTinyInteger('vat_rate')->default(20));
        $this->addColumnIfMissing('unit', fn (Blueprint $table) => $table->string('unit')->nullable());
        $this->addColumnIfMissing('dimensional_weight', fn (Blueprint $table) => $table->decimal('dimensional_weight', 8, 2)->default(1));
        $this->addColumnIfMissing('weight', fn (Blueprint $table) => $table->decimal('weight', 10, 2)->nullable());
        $this->addColumnIfMissing('shipping_type', fn (Blueprint $table) => $table->string('shipping_type')->nullable());
        $this->addColumnIfMissing('main_image_url', fn (Blueprint $table) => $table->text('main_image_url')->nullable());
        $this->addColumnIfMissing('gallery_images', fn (Blueprint $table) => $table->json('gallery_images')->nullable());
        $this->addColumnIfMissing('video_url', fn (Blueprint $table) => $table->text('video_url')->nullable());
        $this->addColumnIfMissing('variant_group', fn (Blueprint $table) => $table->string('variant_group')->nullable());
        $this->addColumnIfMissing('variant_group_key', fn (Blueprint $table) => $table->string('variant_group_key')->nullable());
        $this->addColumnIfMissing('variant_options', fn (Blueprint $table) => $table->json('variant_options')->nullable());
        $this->addColumnIfMissing('variant_attributes', fn (Blueprint $table) => $table->json('variant_attributes')->nullable());
        $this->addColumnIfMissing('variant_sort_order', fn (Blueprint $table) => $table->unsignedInteger('variant_sort_order')->nullable());
        $this->addColumnIfMissing('trendyol_attributes', fn (Blueprint $table) => $table->json('trendyol_attributes')->nullable());
        $this->addColumnIfMissing('hepsiburada_attributes', fn (Blueprint $table) => $table->json('hepsiburada_attributes')->nullable());
        $this->addColumnIfMissing('tags', fn (Blueprint $table) => $table->json('tags')->nullable());
        $this->addColumnIfMissing('attributes', fn (Blueprint $table) => $table->json('attributes')->nullable());
        $this->addColumnIfMissing('marketplace_readiness', fn (Blueprint $table) => $table->json('marketplace_readiness')->nullable());
        $this->addColumnIfMissing('marketplace_ready', fn (Blueprint $table) => $table->boolean('marketplace_ready')->default(false));
        $this->addColumnIfMissing('trendyol_batch_request_id', fn (Blueprint $table) => $table->string('trendyol_batch_request_id')->nullable());
        $this->addColumnIfMissing('last_trendyol_sync_at', fn (Blueprint $table) => $table->timestamp('last_trendyol_sync_at')->nullable());
        $this->addColumnIfMissing('last_import_run_id', fn (Blueprint $table) => $table->unsignedBigInteger('last_import_run_id')->nullable());
        $this->addColumnIfMissing('last_imported_at', fn (Blueprint $table) => $table->timestamp('last_imported_at')->nullable());
        $this->addColumnIfMissing('last_xml_sync_at', fn (Blueprint $table) => $table->timestamp('last_xml_sync_at')->nullable());
        $this->addColumnIfMissing('status', fn (Blueprint $table) => $table->string('status')->default('draft'));
    }

    public function down(): void
    {
        //
    }

    private function addColumnIfMissing(string $column, callable $definition): void
    {
        if (Schema::hasColumn('products', $column)) {
            return;
        }

        Schema::table('products', $definition);
    }
};
