<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('marketplace_category_mappings')) {
            Schema::create('marketplace_category_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code', 40);
            $table->unsignedBigInteger('local_category_id')->nullable();
            $table->string('local_category_name', 191)->nullable();
            $table->string('marketplace_category_id', 80);
            $table->string('marketplace_category_name', 191);
            $table->string('marketplace_category_path')->nullable();
            $table->string('confidence', 40)->nullable();
            $table->string('status', 40)->default('active');
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'marketplace_code'], 'mcm_cat_company_market_idx');
            $table->index(['company_id', 'marketplace_code', 'local_category_id'], 'mcm_cat_local_idx');
            $table->index(['company_id', 'marketplace_code', 'marketplace_category_id'], 'mcm_cat_remote_idx');
            $table->unique(['company_id', 'marketplace_code', 'local_category_id'], 'mcm_cat_unique_local');
            });
        }

        if (! Schema::hasTable('marketplace_brand_mappings')) {
            Schema::create('marketplace_brand_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code', 40);
            $table->unsignedBigInteger('local_brand_id')->nullable();
            $table->string('local_brand_name', 191);
            $table->string('marketplace_brand_id', 80)->nullable();
            $table->string('marketplace_brand_name', 191);
            $table->string('confidence', 40)->nullable();
            $table->string('status', 40)->default('active');
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'marketplace_code'], 'mcm_brand_company_market_idx');
            $table->index(['company_id', 'marketplace_code', 'local_brand_name'], 'mcm_brand_local_idx');
            $table->unique(['company_id', 'marketplace_code', 'local_brand_name'], 'mcm_brand_unique_local');
            });
        }

        if (! Schema::hasTable('marketplace_attribute_mappings')) {
            Schema::create('marketplace_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code', 40);
            $table->unsignedBigInteger('local_category_id')->nullable();
            $table->string('marketplace_category_id', 80)->nullable();
            $table->string('marketplace_attribute_id', 80);
            $table->string('marketplace_attribute_name', 191);
            $table->boolean('required')->default(false);
            $table->string('value_type', 80)->nullable();
            $table->string('source_type', 40);
            $table->string('source_field', 120)->nullable();
            $table->text('fixed_value')->nullable();
            $table->json('value_map')->nullable();
            $table->string('status', 40)->default('active');
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'marketplace_code'], 'mcm_attr_company_market_idx');
            $table->index(['company_id', 'marketplace_code', 'local_category_id'], 'mcm_attr_local_cat_idx');
            $table->index(['company_id', 'marketplace_code', 'marketplace_category_id'], 'mcm_attr_remote_cat_idx');
            $table->index(['company_id', 'marketplace_code', 'marketplace_attribute_id'], 'mcm_attr_remote_attr_idx');
            $table->unique(['company_id', 'marketplace_code', 'marketplace_category_id', 'marketplace_attribute_id'], 'mcm_attr_unique_remote');
            });
        }

        if (! Schema::hasTable('marketplace_variant_attribute_mappings')) {
            Schema::create('marketplace_variant_attribute_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code', 40);
            $table->string('variant_key', 80);
            $table->string('marketplace_attribute_id', 80);
            $table->string('marketplace_attribute_name', 191);
            $table->string('source_type', 40)->default('variant_field');
            $table->string('source_field', 120)->nullable();
            $table->json('value_map')->nullable();
            $table->string('status', 40)->default('active');
            $table->json('metadata')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['company_id', 'marketplace_code'], 'mcm_var_company_market_idx');
            $table->index(['company_id', 'marketplace_code', 'marketplace_attribute_id'], 'mcm_var_remote_attr_idx');
            $table->unique(['company_id', 'marketplace_code', 'variant_key', 'marketplace_attribute_id'], 'mcm_var_unique_attr');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_variant_attribute_mappings');
        Schema::dropIfExists('marketplace_attribute_mappings');
        Schema::dropIfExists('marketplace_brand_mappings');
        Schema::dropIfExists('marketplace_category_mappings');
    }
};
