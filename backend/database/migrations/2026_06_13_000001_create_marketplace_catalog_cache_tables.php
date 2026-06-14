<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('marketplace_catalog_categories')) {
            Schema::create('marketplace_catalog_categories', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('external_id', 64);
            $table->string('parent_external_id', 64)->nullable();
            $table->string('name', 191);
            $table->string('path')->nullable();
            $table->unsignedInteger('level')->nullable();
            $table->boolean('is_leaf')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'external_id'], 'catalog_categories_marketplace_external_unique');
            $table->index(['marketplace_code', 'parent_external_id'], 'catalog_cat_parent_idx');
            });
        }

        if (! Schema::hasTable('marketplace_catalog_brands')) {
            Schema::create('marketplace_catalog_brands', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('external_id', 64)->nullable();
            $table->string('name', 191);
            $table->string('normalized_name', 191);
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'normalized_name'], 'catalog_brands_marketplace_normalized_unique');
            $table->index(['marketplace_code', 'external_id'], 'catalog_brand_external_idx');
            });
        }

        if (! Schema::hasTable('marketplace_catalog_attributes')) {
            Schema::create('marketplace_catalog_attributes', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('category_external_id', 64);
            $table->string('external_id', 64);
            $table->string('name', 191);
            $table->boolean('required')->default(false);
            $table->boolean('allow_custom')->default(false);
            $table->string('value_type')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'category_external_id', 'external_id'], 'catalog_attributes_marketplace_category_external_unique');
            $table->index(['marketplace_code', 'category_external_id', 'required'], 'catalog_attr_category_required_idx');
            });
        }

        if (! Schema::hasTable('marketplace_catalog_attribute_values')) {
            Schema::create('marketplace_catalog_attribute_values', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('attribute_external_id', 64);
            $table->string('category_external_id', 64);
            $table->string('external_id', 64);
            $table->string('name', 191);
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'category_external_id', 'attribute_external_id', 'external_id'], 'catalog_values_marketplace_category_attribute_external_unique');
            $table->index(['marketplace_code', 'category_external_id', 'attribute_external_id'], 'catalog_value_attribute_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_catalog_attribute_values');
        Schema::dropIfExists('marketplace_catalog_attributes');
        Schema::dropIfExists('marketplace_catalog_brands');
        Schema::dropIfExists('marketplace_catalog_categories');
    }
};
