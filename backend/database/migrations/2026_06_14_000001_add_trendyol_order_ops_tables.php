<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            if (! Schema::hasColumn('orders', 'marketplace_account_id')) {
                $table->foreignId('marketplace_account_id')->nullable()->after('company_id')->constrained('marketplace_accounts')->nullOnDelete();
            }
            if (! Schema::hasColumn('orders', 'provider_order_number')) {
                $table->string('provider_order_number')->nullable()->after('marketplace_order_id');
            }
            if (! Schema::hasColumn('orders', 'provider_shipment_package_id')) {
                $table->string('provider_shipment_package_id')->nullable()->after('provider_order_number');
            }
            if (! Schema::hasColumn('orders', 'provider_package_status')) {
                $table->string('provider_package_status')->nullable()->after('provider_shipment_package_id');
            }
            if (! Schema::hasColumn('orders', 'provider_status')) {
                $table->string('provider_status')->nullable()->after('provider_package_status');
            }
            if (! Schema::hasColumn('orders', 'cargo_provider_id')) {
                $table->string('cargo_provider_id')->nullable()->after('provider_status');
            }
            if (! Schema::hasColumn('orders', 'cargo_provider_name')) {
                $table->string('cargo_provider_name')->nullable()->after('cargo_provider_id');
            }
            if (! Schema::hasColumn('orders', 'cargo_tracking_number')) {
                $table->string('cargo_tracking_number')->nullable()->after('cargo_provider_name');
            }
            if (! Schema::hasColumn('orders', 'last_synced_at')) {
                $table->timestamp('last_synced_at')->nullable()->after('cargo_tracking_number');
            }
            if (! Schema::hasColumn('orders', 'provider_payload')) {
                $table->json('provider_payload')->nullable()->after('payload');
            }
        });

        Schema::create('order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('marketplace_account_id')->nullable()->constrained('marketplace_accounts')->nullOnDelete();
            $table->string('marketplace_code')->default('trendyol');
            $table->string('provider_line_id')->nullable();
            $table->string('barcode')->nullable();
            $table->string('sku')->nullable();
            $table->string('name')->nullable();
            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_price', 12, 2)->nullable();
            $table->string('provider_status')->nullable();
            $table->string('cancel_reason_id')->nullable();
            $table->json('provider_payload')->nullable();
            $table->timestamps();

            $table->unique(['order_id', 'provider_line_id'], 'order_items_order_provider_line_unique');
            $table->index(['marketplace_account_id', 'marketplace_code'], 'order_items_account_marketplace_index');
            $table->index('barcode');
            $table->index('sku');
        });

        Schema::create('marketplace_order_operations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
            $table->string('marketplace_code')->default('trendyol');
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
            $table->string('provider_shipment_package_id')->nullable();
            $table->string('operation_type');
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->string('status')->default('pending');
            $table->string('error_code')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamps();

            $table->index(['marketplace_account_id', 'operation_type', 'status'], 'marketplace_order_ops_account_type_status_index');
            $table->index(['order_id', 'created_at'], 'marketplace_order_ops_order_created_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_order_operations');
        Schema::dropIfExists('order_items');

        Schema::table('orders', function (Blueprint $table) {
            if (Schema::hasColumn('orders', 'marketplace_account_id')) {
                $table->dropForeign(['marketplace_account_id']);
            }

            $columns = [
                'marketplace_account_id',
                'provider_order_number',
                'provider_shipment_package_id',
                'provider_package_status',
                'provider_status',
                'cargo_provider_id',
                'cargo_provider_name',
                'cargo_tracking_number',
                'last_synced_at',
                'provider_payload',
            ];

            foreach ($columns as $column) {
                if (Schema::hasColumn('orders', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
