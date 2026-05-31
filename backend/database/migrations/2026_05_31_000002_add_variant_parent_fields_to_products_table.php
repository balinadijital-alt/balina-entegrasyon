<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('parent_product_id')->nullable()->after('xml_source_id')->constrained('products')->nullOnDelete();
            $table->string('variant_group_key')->nullable()->after('variant_group');
            $table->json('variant_attributes')->nullable()->after('variant_options');
            $table->unsignedInteger('variant_sort_order')->nullable()->after('variant_attributes');

            $table->index(['company_id', 'parent_product_id']);
            $table->index(['company_id', 'variant_group_key']);
            $table->index(['company_id', 'xml_source_id', 'variant_group_key'], 'products_company_xml_variant_group_index');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'parent_product_id']);
            $table->dropIndex(['company_id', 'variant_group_key']);
            $table->dropIndex('products_company_xml_variant_group_index');
            $table->dropConstrainedForeignId('parent_product_id');
            $table->dropColumn(['variant_group_key', 'variant_attributes', 'variant_sort_order']);
        });
    }
};
