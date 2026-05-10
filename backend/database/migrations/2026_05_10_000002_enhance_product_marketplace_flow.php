<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            $table->string('product_type')->default('standard')->after('name');
            $table->text('short_description')->nullable()->after('product_type');
            $table->string('seo_title')->nullable()->after('description');
            $table->text('seo_description')->nullable()->after('seo_title');
            $table->decimal('purchase_price', 12, 2)->nullable()->after('trendyol_category_id');
            $table->unsignedInteger('critical_stock')->default(0)->after('stock');
            $table->decimal('weight', 10, 2)->nullable()->after('dimensional_weight');
            $table->string('shipping_type')->nullable()->after('weight');
            $table->text('main_image_url')->nullable()->after('shipping_type');
            $table->json('gallery_images')->nullable()->after('main_image_url');
            $table->text('video_url')->nullable()->after('gallery_images');
            $table->string('hepsiburada_category_id')->nullable()->after('trendyol_category_id');
            $table->json('hepsiburada_attributes')->nullable()->after('trendyol_attributes');
            $table->json('marketplace_readiness')->nullable()->after('hepsiburada_attributes');
            $table->boolean('marketplace_ready')->default(false)->after('marketplace_readiness');
        });

        Schema::create('product_marketplace_statuses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('marketplace_code');
            $table->string('status')->default('draft');
            $table->string('readiness_status')->default('not_ready');
            $table->json('missing_fields')->nullable();
            $table->string('external_product_id')->nullable();
            $table->string('batch_request_id')->nullable();
            $table->json('last_payload')->nullable();
            $table->json('last_response')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'marketplace_code']);
            $table->index(['marketplace_code', 'status']);
        });

        Schema::create('marketplace_publish_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('marketplace_account_id')->nullable()->constrained()->nullOnDelete();
            $table->string('marketplace_code');
            $table->string('status')->default('draft');
            $table->json('product_ids');
            $table->json('mappings')->nullable();
            $table->json('price_controls')->nullable();
            $table->json('readiness_report')->nullable();
            $table->json('payload_preview')->nullable();
            $table->json('result_summary')->nullable();
            $table->text('error_message')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_publish_drafts');
        Schema::dropIfExists('product_marketplace_statuses');

        Schema::table('products', function (Blueprint $table) {
            $table->dropColumn([
                'product_type',
                'short_description',
                'seo_title',
                'seo_description',
                'purchase_price',
                'critical_stock',
                'weight',
                'shipping_type',
                'main_image_url',
                'gallery_images',
                'video_url',
                'hepsiburada_category_id',
                'hepsiburada_attributes',
                'marketplace_readiness',
                'marketplace_ready',
            ]);
        });
    }
};
