<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('products')) {
            return;
        }

        $this->addColumnIfMissing('products', 'product_type', fn (Blueprint $table) => $table->string('product_type', 80)->default('standard'));
        $this->addColumnIfMissing('products', 'short_description', fn (Blueprint $table) => $table->text('short_description')->nullable());
        $this->addColumnIfMissing('products', 'seo_title', fn (Blueprint $table) => $table->string('seo_title')->nullable());
        $this->addColumnIfMissing('products', 'seo_description', fn (Blueprint $table) => $table->text('seo_description')->nullable());
        $this->addColumnIfMissing('products', 'purchase_price', fn (Blueprint $table) => $table->decimal('purchase_price', 12, 2)->nullable());
        $this->addColumnIfMissing('products', 'critical_stock', fn (Blueprint $table) => $table->unsignedInteger('critical_stock')->default(0));
        $this->addColumnIfMissing('products', 'weight', fn (Blueprint $table) => $table->decimal('weight', 10, 2)->nullable());
        $this->addColumnIfMissing('products', 'shipping_type', fn (Blueprint $table) => $table->string('shipping_type')->nullable());
        $this->addColumnIfMissing('products', 'main_image_url', fn (Blueprint $table) => $table->text('main_image_url')->nullable());
        $this->addColumnIfMissing('products', 'gallery_images', fn (Blueprint $table) => $table->json('gallery_images')->nullable());
        $this->addColumnIfMissing('products', 'video_url', fn (Blueprint $table) => $table->text('video_url')->nullable());
        $this->addColumnIfMissing('products', 'hepsiburada_category_id', fn (Blueprint $table) => $table->string('hepsiburada_category_id')->nullable());
        $this->addColumnIfMissing('products', 'hepsiburada_attributes', fn (Blueprint $table) => $table->json('hepsiburada_attributes')->nullable());
        $this->addColumnIfMissing('products', 'marketplace_readiness', fn (Blueprint $table) => $table->json('marketplace_readiness')->nullable());
        $this->addColumnIfMissing('products', 'marketplace_ready', fn (Blueprint $table) => $table->boolean('marketplace_ready')->default(false));

        $this->createMarketplacePublishDraftsTable();
    }

    public function down(): void
    {
        //
    }

    private function createMarketplacePublishDraftsTable(): void
    {
        if (Schema::hasTable('marketplace_publish_drafts')) {
            return;
        }

        Schema::create('marketplace_publish_drafts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->nullable()->index();
            $table->unsignedBigInteger('marketplace_account_id')->nullable()->index();
            $table->string('marketplace_code', 80);
            $table->string('status', 80)->default('draft');
            $table->json('product_ids');
            $table->json('mappings')->nullable();
            $table->json('price_controls')->nullable();
            $table->json('readiness_report')->nullable();
            $table->json('payload_preview')->nullable();
            $table->json('result_summary')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedBigInteger('created_by')->nullable()->index();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
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
