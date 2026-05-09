<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_import_errors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_import_run_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('row_number');
            $table->string('sku')->nullable();
            $table->string('barcode')->nullable();
            $table->text('message');
            $table->json('payload')->nullable();
            $table->timestamps();

            $table->index(['product_import_run_id', 'row_number']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_import_errors');
    }
};
