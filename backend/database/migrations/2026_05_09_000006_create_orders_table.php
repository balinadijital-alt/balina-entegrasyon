<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code');
            $table->string('marketplace_order_id');
            $table->string('customer_name')->nullable();
            $table->string('customer_email')->nullable();
            $table->decimal('total_amount', 12, 2)->default(0);
            $table->string('status')->default('new');
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->unique(['marketplace_code', 'marketplace_order_id']);
            $table->index(['company_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
