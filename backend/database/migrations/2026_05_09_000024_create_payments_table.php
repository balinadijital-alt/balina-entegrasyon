<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_account_id')->nullable()->constrained()->nullOnDelete();
            $table->string('provider_code');
            $table->string('method')->default('card');
            $table->string('status')->default('pending');
            $table->decimal('amount', 12, 2);
            $table->decimal('refunded_amount', 12, 2)->default(0);
            $table->unsignedTinyInteger('installment_count')->default(1);
            $table->decimal('commission_rate', 8, 4)->default(0);
            $table->decimal('commission_amount', 12, 2)->default(0);
            $table->string('currency', 3)->default('TRY');
            $table->string('conversation_id')->nullable()->index();
            $table->string('transaction_id')->nullable()->index();
            $table->text('payment_url')->nullable();
            $table->text('three_d_html')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->timestamps();

            $table->index(['order_id', 'status']);
            $table->index(['provider_code', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
