<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('shipping_account_id')->constrained()->cascadeOnDelete();
            $table->string('carrier_code');
            $table->string('status')->default('queued');
            $table->string('barcode')->nullable();
            $table->string('tracking_number')->nullable();
            $table->string('label_path')->nullable();
            $table->text('label_url')->nullable();
            $table->string('return_code')->nullable();
            $table->string('last_action')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('shipped_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            $table->index(['carrier_code', 'tracking_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipments');
    }
};
