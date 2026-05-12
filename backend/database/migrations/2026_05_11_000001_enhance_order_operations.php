<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->string('customer_phone')->nullable()->after('customer_email');
            $table->json('shipping_address')->nullable()->after('customer_phone');
            $table->json('billing_address')->nullable()->after('shipping_address');
            $table->string('payment_status')->nullable()->after('status');
            $table->string('shipping_status')->nullable()->after('payment_status');
            $table->string('invoice_status')->nullable()->after('shipping_status');
            $table->text('cancel_reason')->nullable()->after('invoice_status');
            $table->text('return_reason')->nullable()->after('cancel_reason');
            $table->text('problem_note')->nullable()->after('return_reason');
            $table->json('operation_flags')->nullable()->after('problem_note');

            $table->index(['marketplace_code', 'status']);
            $table->index(['payment_status', 'shipping_status', 'invoice_status'], 'orders_operation_status_index');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropIndex(['marketplace_code', 'status']);
            $table->dropIndex('orders_operation_status_index');
            $table->dropColumn([
                'customer_phone',
                'shipping_address',
                'billing_address',
                'payment_status',
                'shipping_status',
                'invoice_status',
                'cancel_reason',
                'return_reason',
                'problem_note',
                'operation_flags',
            ]);
        });
    }
};
