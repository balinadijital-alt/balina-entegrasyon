<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createInvoicesTable();
        $this->createImportTables();
        $this->createUsageCountersTable();
        $this->createInboundWebhookDeliveriesTable();
    }

    public function down(): void
    {
        //
    }

    private function createInvoicesTable(): void
    {
        if (Schema::hasTable('invoices')) {
            return;
        }

        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->unsignedBigInteger('order_id')->nullable()->index();
            $table->unsignedBigInteger('current_account_id')->nullable()->index();
            $table->unsignedBigInteger('accounting_account_id')->nullable()->index();
            $table->string('type', 80)->default('earchive');
            $table->string('scenario', 80)->default('basic');
            $table->string('status', 80)->default('draft');
            $table->string('invoice_number', 191)->nullable()->index();
            $table->string('external_id', 191)->nullable()->index();
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

    private function createImportTables(): void
    {
        if (! Schema::hasTable('product_import_runs')) {
            Schema::create('product_import_runs', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->index();
                $table->unsignedBigInteger('xml_source_id')->nullable()->index();
                $table->string('source_type', 80);
                $table->string('supplier_name')->nullable();
                $table->string('original_filename')->nullable();
                $table->string('stored_path')->nullable();
                $table->json('field_mapping');
                $table->json('options')->nullable();
                $table->string('queue', 80)->default('imports');
                $table->string('job_uuid', 191)->nullable();
                $table->string('status', 80)->default('queued');
                $table->unsignedInteger('total_rows')->default(0);
                $table->unsignedInteger('processed_rows')->default(0);
                $table->unsignedInteger('success_count')->default(0);
                $table->unsignedInteger('error_count')->default(0);
                $table->unsignedInteger('created_count')->default(0);
                $table->unsignedInteger('updated_count')->default(0);
                $table->unsignedInteger('skipped_count')->default(0);
                $table->unsignedTinyInteger('progress')->default(0);
                $table->json('report')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamp('queued_at')->nullable();
                $table->timestamp('started_at')->nullable();
                $table->timestamp('finished_at')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'status']);
                $table->index(['source_type', 'created_at']);
            });
        }
    }

    private function createUsageCountersTable(): void
    {
        if (Schema::hasTable('usage_counters')) {
            return;
        }

        Schema::create('usage_counters', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->index();
            $table->string('metric', 120);
            $table->unsignedInteger('used')->default(0);
            $table->unsignedInteger('limit')->default(0);
            $table->timestamp('period_starts_at')->nullable();
            $table->timestamp('period_ends_at')->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'metric']);
        });
    }

    private function createInboundWebhookDeliveriesTable(): void
    {
        if (! Schema::hasTable('inbound_webhook_deliveries')) {
            Schema::create('inbound_webhook_deliveries', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id')->nullable()->index();
                $table->unsignedBigInteger('marketplace_account_id')->nullable()->index();
                $table->string('marketplace_code', 80)->index();
                $table->string('delivery_id', 191)->nullable();
                $table->string('idempotency_key', 191)->unique();
                $table->string('event', 120)->nullable();
                $table->string('status', 80)->default('received')->index();
                $table->json('payload')->nullable();
                $table->boolean('signature_valid')->default(false);
                $table->timestamp('processed_at')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'created_at'], 'inbound_company_created_idx');
                $table->index(['marketplace_account_id', 'created_at'], 'inbound_marketplace_created_idx');
            });
        }

        $this->addColumnIfMissing('inbound_webhook_deliveries', 'request_id', fn (Blueprint $table) => $table->string('request_id', 191)->nullable()->index());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'correlation_id', fn (Blueprint $table) => $table->string('correlation_id', 191)->nullable()->index());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'business_event_key', fn (Blueprint $table) => $table->string('business_event_key', 191)->nullable()->index());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'body_sha256', fn (Blueprint $table) => $table->string('body_sha256', 191)->nullable()->index());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'source_ip', fn (Blueprint $table) => $table->string('source_ip')->nullable());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'user_agent', fn (Blueprint $table) => $table->string('user_agent')->nullable());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'provider_timestamp', fn (Blueprint $table) => $table->timestamp('provider_timestamp')->nullable());
        $this->addColumnIfMissing('inbound_webhook_deliveries', 'received_at', fn (Blueprint $table) => $table->timestamp('received_at')->nullable());
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
