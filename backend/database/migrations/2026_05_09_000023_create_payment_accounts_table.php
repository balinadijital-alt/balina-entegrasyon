<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('payment_provider_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->text('merchant_id')->nullable();
            $table->text('api_key')->nullable();
            $table->text('api_secret')->nullable();
            $table->text('client_id')->nullable();
            $table->text('client_secret')->nullable();
            $table->text('base_url')->nullable();
            $table->text('webhook_secret')->nullable();
            $table->json('installment_rates')->nullable();
            $table->json('commission_rates')->nullable();
            $table->json('settings')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'payment_provider_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_accounts');
    }
};
