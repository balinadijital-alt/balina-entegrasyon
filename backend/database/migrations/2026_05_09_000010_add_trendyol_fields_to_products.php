<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->unsignedBigInteger('trendyol_brand_id')->nullable()->after('brand');
            $table->unsignedBigInteger('trendyol_category_id')->nullable()->after('category');
            $table->decimal('list_price', 12, 2)->nullable()->after('price');
            $table->decimal('dimensional_weight', 8, 2)->default(1)->after('vat_rate');
            $table->json('trendyol_attributes')->nullable()->after('dimensional_weight');
            $table->string('trendyol_batch_request_id')->nullable()->after('trendyol_attributes');
            $table->timestamp('last_trendyol_sync_at')->nullable()->after('trendyol_batch_request_id');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn([
                'trendyol_brand_id',
                'trendyol_category_id',
                'list_price',
                'dimensional_weight',
                'trendyol_attributes',
                'trendyol_batch_request_id',
                'last_trendyol_sync_at',
            ]);
        });
    }
};
