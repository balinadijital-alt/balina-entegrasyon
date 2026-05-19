<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('inbound_webhook_deliveries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('marketplace_account_id')->nullable()->constrained('marketplace_accounts')->nullOnDelete();
            $table->string('marketplace_code')->index();
            $table->string('delivery_id')->nullable();
            $table->string('idempotency_key')->unique();
            $table->string('event')->nullable();
            $table->string('status')->default('received')->index();
            $table->json('payload')->nullable();
            $table->boolean('signature_valid')->default(false);
            $table->timestamp('processed_at')->nullable();
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'created_at']);
            $table->index(['marketplace_account_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('inbound_webhook_deliveries');
    }
};
