<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createProductMarketplaceStatusesTable();
        $this->createAccountingLogsTable();
    }

    public function down(): void
    {
        //
    }

    private function createProductMarketplaceStatusesTable(): void
    {
        if (Schema::hasTable('product_marketplace_statuses')) {
            return;
        }

        Schema::create('product_marketplace_statuses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('product_id')->index();
            $table->string('marketplace_code', 80);
            $table->string('status', 80)->default('draft');
            $table->string('readiness_status', 80)->default('not_ready');
            $table->json('missing_fields')->nullable();
            $table->string('external_product_id', 191)->nullable();
            $table->string('batch_request_id', 191)->nullable();
            $table->json('last_payload')->nullable();
            $table->json('last_response')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('last_checked_at')->nullable();
            $table->timestamp('last_sent_at')->nullable();
            $table->timestamps();

            $table->unique(['product_id', 'marketplace_code']);
            $table->index(['marketplace_code', 'status'], 'product_market_status_idx');
        });
    }

    private function createAccountingLogsTable(): void
    {
        if (Schema::hasTable('accounting_logs')) {
            return;
        }

        Schema::create('accounting_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('accounting_account_id')->nullable()->index();
            $table->unsignedBigInteger('invoice_id')->nullable()->index();
            $table->string('provider_code', 80)->nullable()->index();
            $table->string('event', 120);
            $table->string('status', 80)->nullable();
            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();
            $table->text('error_message')->nullable();
            $table->unsignedInteger('duration_ms')->nullable();
            $table->timestamps();
        });
    }
};
