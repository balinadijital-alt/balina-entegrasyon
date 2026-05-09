<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('category_mappings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code');
            $table->string('local_category');
            $table->string('external_category_id');
            $table->string('external_category_name')->nullable();
            $table->json('attributes')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'marketplace_code', 'local_category']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('category_mappings');
    }
};
