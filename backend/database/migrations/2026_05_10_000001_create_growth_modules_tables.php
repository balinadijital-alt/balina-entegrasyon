<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cms_pages', fn (Blueprint $table) => $this->content($table, ['slug', 'status']));
        Schema::create('blog_categories', fn (Blueprint $table) => $this->content($table, ['slug', 'status']));
        Schema::create('blog_posts', function (Blueprint $table) {
            $this->content($table, ['slug', 'status']);
            $table->foreignId('blog_category_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('published_at')->nullable();
        });
        Schema::create('banners', fn (Blueprint $table) => $this->content($table, ['placement', 'status']));
        Schema::create('popups', fn (Blueprint $table) => $this->content($table, ['trigger', 'status']));
        Schema::create('navigation_menus', fn (Blueprint $table) => $this->content($table, ['location', 'status']));
        Schema::create('faqs', fn (Blueprint $table) => $this->content($table, ['category', 'status']));
        Schema::create('legal_documents', fn (Blueprint $table) => $this->content($table, ['type', 'status']));

        Schema::create('coupons', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('code')->index();
            $table->string('name');
            $table->string('type')->default('fixed');
            $table->decimal('value', 14, 2)->default(0);
            $table->decimal('minimum_cart_amount', 14, 2)->default(0);
            $table->boolean('free_shipping')->default(false);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->boolean('is_active')->default(true);
            $table->json('rules')->nullable();
            $table->timestamps();
        });
        Schema::create('abandoned_carts', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('customer_email')->nullable();
            $table->string('customer_phone')->nullable();
            $table->decimal('cart_total', 14, 2)->default(0);
            $table->json('items')->nullable();
            $table->string('status')->default('open');
            $table->timestamp('last_activity_at')->nullable();
            $table->timestamp('recovered_at')->nullable();
            $table->timestamps();
        });
        Schema::create('message_templates', fn (Blueprint $table) => $this->messageTemplate($table));
        Schema::create('notification_channels', fn (Blueprint $table) => $this->content($table, ['channel', 'status']));
        Schema::create('marketing_feeds', fn (Blueprint $table) => $this->content($table, ['provider', 'status']));
        Schema::create('tracking_pixels', fn (Blueprint $table) => $this->content($table, ['provider', 'status']));

        Schema::create('product_variant_options', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('name');
            $table->json('values')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('product_relations', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('related_product_id')->constrained('products')->cascadeOnDelete();
            $table->string('type')->default('complementary');
            $table->timestamps();
        });
        Schema::create('product_custom_fields', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('name');
            $table->string('field_type')->default('text');
            $table->json('options')->nullable();
            $table->boolean('is_required')->default(false);
            $table->timestamps();
        });
        Schema::create('product_barcode_batches', fn (Blueprint $table) => $this->content($table, ['prefix', 'status']));
        Schema::create('product_reviews', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->string('customer_name');
            $table->string('customer_email')->nullable();
            $table->unsignedTinyInteger('rating')->default(5);
            $table->text('comment');
            $table->string('status')->default('pending');
            $table->text('moderation_note')->nullable();
            $table->timestamps();
        });

        Schema::create('profit_rules', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('scope')->default('marketplace');
            $table->string('scope_value')->nullable();
            $table->decimal('profit_rate', 8, 4)->default(0);
            $table->decimal('minimum_profit_amount', 14, 2)->default(0);
            $table->json('costs')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('bulk_price_operations', function (Blueprint $table) {
            $this->tenant($table);
            $table->string('operation_type')->default('increase_percent');
            $table->decimal('value', 14, 4)->default(0);
            $table->json('filters')->nullable();
            $table->string('status')->default('queued');
            $table->unsignedInteger('affected_count')->default(0);
            $table->timestamps();
        });
        Schema::create('price_calculations', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('product_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('base_cost', 14, 2)->default(0);
            $table->decimal('commission_cost', 14, 2)->default(0);
            $table->decimal('tax_cost', 14, 2)->default(0);
            $table->decimal('shipping_cost', 14, 2)->default(0);
            $table->decimal('packaging_cost', 14, 2)->default(0);
            $table->decimal('ad_cost', 14, 2)->default(0);
            $table->decimal('profit_amount', 14, 2)->default(0);
            $table->decimal('sale_price', 14, 2)->default(0);
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('order_workflow_rules', fn (Blueprint $table) => $this->content($table, ['from_status', 'to_status']));
        Schema::create('order_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type')->default('internal');
            $table->text('note');
            $table->timestamps();
        });
        Schema::create('order_operation_histories', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('event');
            $table->string('from_status')->nullable();
            $table->string('to_status')->nullable();
            $table->json('payload')->nullable();
            $table->timestamps();
        });

        Schema::create('dealer_groups', fn (Blueprint $table) => $this->content($table, ['code', 'status']));
        Schema::create('dealers', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('dealer_group_id')->nullable()->constrained()->nullOnDelete();
            $table->string('name');
            $table->string('email')->nullable();
            $table->string('phone')->nullable();
            $table->decimal('discount_rate', 8, 4)->default(0);
            $table->decimal('balance', 14, 2)->default(0);
            $table->json('xml_settings')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
        Schema::create('dealer_prices', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('dealer_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->decimal('price', 14, 2);
            $table->timestamps();
        });
        Schema::create('dealer_transactions', function (Blueprint $table) {
            $this->tenant($table);
            $table->foreignId('dealer_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type')->default('collection');
            $table->decimal('amount', 14, 2);
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('seo_settings', fn (Blueprint $table) => $this->content($table, ['scope', 'status']));
        Schema::create('site_scripts', fn (Blueprint $table) => $this->content($table, ['placement', 'status']));
        Schema::create('sitemap_entries', fn (Blueprint $table) => $this->content($table, ['url', 'status']));
        Schema::create('robots_rules', fn (Blueprint $table) => $this->content($table, ['directive', 'status']));
        Schema::create('currency_rates', function (Blueprint $table) {
            $table->id();
            $table->string('base_currency', 3)->default('TRY');
            $table->string('target_currency', 3);
            $table->decimal('rate', 14, 6);
            $table->timestamp('fetched_at')->nullable();
            $table->timestamps();
        });
        Schema::create('locations', fn (Blueprint $table) => $this->content($table, ['code', 'type', 'parent_code']));
        Schema::create('languages', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->boolean('is_default')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
            $table->string('module')->index();
            $table->string('action')->index();
            $table->string('auditable_type')->nullable();
            $table->unsignedBigInteger('auditable_id')->nullable();
            $table->json('old_values')->nullable();
            $table->json('new_values')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        collect([
            'audit_logs', 'languages', 'locations', 'currency_rates', 'robots_rules', 'sitemap_entries', 'site_scripts', 'seo_settings',
            'dealer_transactions', 'dealer_prices', 'dealers', 'dealer_groups', 'order_operation_histories', 'order_notes', 'order_workflow_rules',
            'price_calculations', 'bulk_price_operations', 'profit_rules', 'product_reviews', 'product_barcode_batches', 'product_custom_fields',
            'product_relations', 'product_variant_options', 'tracking_pixels', 'marketing_feeds', 'notification_channels', 'message_templates',
            'abandoned_carts', 'coupons', 'legal_documents', 'faqs', 'navigation_menus', 'popups', 'banners', 'blog_posts', 'blog_categories', 'cms_pages',
        ])->each(fn ($table) => Schema::dropIfExists($table));
    }

    private function content(Blueprint $table, array $extra = []): void
    {
        $this->tenant($table);
        foreach ($extra as $column) {
            $table->string($column)->nullable()->index();
        }
        $table->string('title')->nullable();
        $table->string('name')->nullable();
        $table->text('excerpt')->nullable();
        $table->longText('content')->nullable();
        $table->json('settings')->nullable();
        $table->unsignedInteger('sort_order')->default(0);
        $table->boolean('is_active')->default(true);
        $table->timestamps();
    }

    private function messageTemplate(Blueprint $table): void
    {
        $this->tenant($table);
        $table->string('channel')->index();
        $table->string('code')->index();
        $table->string('name');
        $table->string('subject')->nullable();
        $table->longText('body');
        $table->json('variables')->nullable();
        $table->boolean('is_active')->default(true);
        $table->timestamps();
    }

    private function tenant(Blueprint $table): void
    {
        $table->id();
        $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
    }
};
