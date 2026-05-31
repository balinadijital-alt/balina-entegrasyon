<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('xml_source_id')->nullable()->after('supplier_name')->constrained('xml_sources')->nullOnDelete();
            $table->string('source_product_code')->nullable()->after('xml_source_id');
            $table->timestamp('last_xml_sync_at')->nullable()->after('last_imported_at');

            $table->index(['company_id', 'xml_source_id']);
            $table->index(['company_id', 'xml_source_id', 'source_product_code'], 'products_company_xml_source_code_index');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'xml_source_id']);
            $table->dropIndex('products_company_xml_source_code_index');
            $table->dropConstrainedForeignId('xml_source_id');
            $table->dropColumn(['source_product_code', 'last_xml_sync_at']);
        });
    }
};
