<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('marketplace_accounts', function (Blueprint $table) {
            $table->string('connection_status')->default('unknown')->after('is_active');
            $table->timestamp('connection_checked_at')->nullable()->after('connection_status');
            $table->timestamp('last_product_sync_at')->nullable()->after('connection_checked_at');
            $table->timestamp('last_price_sync_at')->nullable()->after('last_product_sync_at');
            $table->timestamp('last_order_sync_at')->nullable()->after('last_price_sync_at');
            $table->text('last_error')->nullable()->after('last_order_sync_at');
            $table->json('metadata')->nullable()->after('last_error');
        });
    }

    public function down(): void
    {
        Schema::table('marketplace_accounts', function (Blueprint $table) {
            $table->dropColumn([
                'connection_status',
                'connection_checked_at',
                'last_product_sync_at',
                'last_price_sync_at',
                'last_order_sync_at',
                'last_error',
                'metadata',
            ]);
        });
    }
};
