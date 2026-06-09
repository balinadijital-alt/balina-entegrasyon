<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createCatalogResourcesTable();

        if (Schema::hasTable('products')) {
            $this->addColumnIfMissing('products', 'tags', fn (Blueprint $table) => $table->json('tags')->nullable());
            $this->addColumnIfMissing('products', 'attributes', fn (Blueprint $table) => $table->json('attributes')->nullable());
            $this->addColumnIfMissing('products', 'unit', fn (Blueprint $table) => $table->string('unit')->nullable());
        }
    }

    public function down(): void
    {
        //
    }

    private function createCatalogResourcesTable(): void
    {
        if (Schema::hasTable('catalog_resources')) {
            return;
        }

        Schema::create('catalog_resources', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('parent_id')->nullable()->index();
            $table->string('type', 40);
            $table->string('name');
            $table->string('code', 120)->nullable();
            $table->text('description')->nullable();
            $table->string('image_url')->nullable();
            $table->json('values')->nullable();
            $table->json('settings')->nullable();
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['company_id', 'type', 'is_active'], 'catalog_company_type_active_idx');
            $table->index(['type', 'parent_id'], 'catalog_type_parent_idx');
        });
    }

    private function addColumnIfMissing(string $table, string $column, \Closure $definition): void
    {
        if (Schema::hasColumn($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $table) use ($definition) {
            $definition($table);
        });
    }
};
