<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketplace_catalog_categories', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('external_id');
            $table->string('parent_external_id')->nullable();
            $table->string('name');
            $table->string('path')->nullable();
            $table->unsignedInteger('level')->nullable();
            $table->boolean('is_leaf')->default(false);
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'external_id'], 'catalog_categories_marketplace_external_unique');
            $table->index(['marketplace_code', 'parent_external_id']);
        });

        Schema::create('marketplace_catalog_brands', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('external_id')->nullable();
            $table->string('name');
            $table->string('normalized_name');
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'normalized_name'], 'catalog_brands_marketplace_normalized_unique');
            $table->index(['marketplace_code', 'external_id']);
        });

        Schema::create('marketplace_catalog_attributes', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('category_external_id');
            $table->string('external_id');
            $table->string('name');
            $table->boolean('required')->default(false);
            $table->boolean('allow_custom')->default(false);
            $table->string('value_type')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'category_external_id', 'external_id'], 'catalog_attributes_marketplace_category_external_unique');
            $table->index(['marketplace_code', 'category_external_id', 'required']);
        });

        Schema::create('marketplace_catalog_attribute_values', function (Blueprint $table) {
            $table->id();
            $table->string('marketplace_code', 40);
            $table->string('attribute_external_id');
            $table->string('category_external_id');
            $table->string('external_id');
            $table->string('name');
            $table->json('metadata')->nullable();
            $table->timestamp('last_synced_at')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'category_external_id', 'attribute_external_id', 'external_id'], 'catalog_values_marketplace_category_attribute_external_unique');
            $table->index(['marketplace_code', 'category_external_id', 'attribute_external_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_catalog_attribute_values');
        Schema::dropIfExists('marketplace_catalog_attributes');
        Schema::dropIfExists('marketplace_catalog_brands');
        Schema::dropIfExists('marketplace_catalog_categories');
    }
};
