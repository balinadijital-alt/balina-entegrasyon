<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('current_account_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('accounting_account_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type')->default('earchive');
            $table->string('scenario')->default('basic');
            $table->string('status')->default('draft');
            $table->string('invoice_number')->nullable()->index();
            $table->string('external_id')->nullable()->index();
            $table->decimal('subtotal', 14, 2)->default(0);
            $table->decimal('tax_total', 14, 2)->default(0);
            $table->decimal('grand_total', 14, 2)->default(0);
            $table->string('currency', 3)->default('TRY');
            $table->json('lines')->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->string('pdf_path')->nullable();
            $table->text('pdf_url')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('issued_at')->nullable();
            $table->timestamps();

            $table->index(['company_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
