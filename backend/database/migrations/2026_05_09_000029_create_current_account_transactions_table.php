<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('current_account_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('current_account_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type');
            $table->string('direction');
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('TRY');
            $table->text('description')->nullable();
            $table->timestamp('transaction_date')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['current_account_id', 'type']);
            $table->index(['order_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('current_account_transactions');
    }
};
