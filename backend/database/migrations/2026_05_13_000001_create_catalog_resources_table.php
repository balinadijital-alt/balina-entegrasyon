<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_resources', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('catalog_resources')->nullOnDelete();
            $table->string('type', 40);
            $table->string('name');
            $table->string('code')->nullable();
            $table->text('description')->nullable();
            $table->string('image_url')->nullable();
            $table->json('values')->nullable();
            $table->json('settings')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'type', 'is_active']);
            $table->index(['type', 'parent_id']);
        });

        Schema::table('products', function (Blueprint $table) {
            $table->json('tags')->nullable()->after('hepsiburada_attributes');
            $table->json('attributes')->nullable()->after('tags');
            $table->string('unit')->nullable()->after('vat_rate');
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn(['tags', 'attributes', 'unit']);
        });

        Schema::dropIfExists('catalog_resources');
    }
};
