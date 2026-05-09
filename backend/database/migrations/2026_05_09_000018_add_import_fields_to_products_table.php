<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('supplier_name')->nullable()->after('company_id');
            $table->string('variant_group')->nullable()->after('dimensional_weight');
            $table->json('variant_options')->nullable()->after('variant_group');
            $table->foreignId('last_import_run_id')->nullable()->after('last_trendyol_sync_at')->constrained('product_import_runs')->nullOnDelete();
            $table->timestamp('last_imported_at')->nullable()->after('last_import_run_id');
            $table->index(['company_id', 'barcode']);
            $table->index(['company_id', 'supplier_name']);
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropIndex(['company_id', 'barcode']);
            $table->dropIndex(['company_id', 'supplier_name']);
            $table->dropConstrainedForeignId('last_import_run_id');
            $table->dropColumn(['supplier_name', 'variant_group', 'variant_options', 'last_imported_at']);
        });
    }
};
