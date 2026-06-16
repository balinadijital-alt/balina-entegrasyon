<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('marketplace_return_claims')) {
            Schema::create('marketplace_return_claims', function (Blueprint $table) {
                $table->id();
                $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
                $table->string('marketplace_code')->default('trendyol');
                $table->string('provider_claim_id', 191);
                $table->string('provider_order_number')->nullable();
                $table->string('provider_shipment_package_id')->nullable();
                $table->string('status')->nullable();
                $table->string('customer_masked')->nullable();
                $table->timestamp('claim_date')->nullable();
                $table->timestamp('last_synced_at')->nullable();
                $table->json('provider_payload')->nullable();
                $table->timestamps();
            });
        }

        $this->shrinkStringColumnForMySqlIndex('marketplace_return_claims', 'provider_claim_id');
        Schema::table('marketplace_return_claims', function (Blueprint $table) {
            if (! $this->indexExists('marketplace_return_claims', 'mr_claims_acc_claim_unique')) {
                $table->unique(['marketplace_account_id', 'provider_claim_id'], 'mr_claims_acc_claim_unique');
            }
            if (! $this->indexExists('marketplace_return_claims', 'mr_claims_acc_status_idx')) {
                $table->index(['marketplace_account_id', 'status'], 'mr_claims_acc_status_idx');
            }
        });

        if (! Schema::hasTable('marketplace_return_claim_items')) {
            Schema::create('marketplace_return_claim_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('marketplace_return_claim_id')->constrained('marketplace_return_claims')->cascadeOnDelete();
                $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
                $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
                $table->foreignId('order_item_id')->nullable()->constrained('order_items')->nullOnDelete();
                $table->string('provider_claim_line_item_id', 191);
                $table->string('barcode')->nullable();
                $table->string('sku')->nullable();
                $table->unsignedInteger('quantity')->default(1);
                $table->string('status')->nullable();
                $table->string('reason_id')->nullable();
                $table->string('reason_name')->nullable();
                $table->json('provider_payload')->nullable();
                $table->timestamps();
            });
        }

        $this->shrinkStringColumnForMySqlIndex('marketplace_return_claim_items', 'provider_claim_line_item_id');
        Schema::table('marketplace_return_claim_items', function (Blueprint $table) {
            if (! $this->indexExists('marketplace_return_claim_items', 'mr_items_acc_line_unique')) {
                $table->unique(['marketplace_account_id', 'provider_claim_line_item_id'], 'mr_items_acc_line_unique');
            }
            if (! $this->indexExists('marketplace_return_claim_items', 'mr_items_claim_status_idx')) {
                $table->index(['marketplace_return_claim_id', 'status'], 'mr_items_claim_status_idx');
            }
            if (! $this->indexExists('marketplace_return_claim_items', 'mr_items_acc_barcode_idx')) {
                $table->index(['marketplace_account_id', 'barcode'], 'mr_items_acc_barcode_idx');
            }
        });

        if (! Schema::hasTable('marketplace_return_operations')) {
            Schema::create('marketplace_return_operations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('marketplace_account_id')->constrained('marketplace_accounts')->cascadeOnDelete();
                $table->string('marketplace_code')->default('trendyol');
                $table->foreignId('marketplace_return_claim_id')->nullable()->constrained('marketplace_return_claims')->nullOnDelete();
                $table->foreignId('marketplace_return_claim_item_id')->nullable()->constrained('marketplace_return_claim_items')->nullOnDelete();
                $table->string('operation_type');
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->string('status')->default('pending');
                $table->string('error_code')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamps();
            });
        }

        Schema::table('marketplace_return_operations', function (Blueprint $table) {
            if (! $this->indexExists('marketplace_return_operations', 'mr_ops_acc_type_status_idx')) {
                $table->index(['marketplace_account_id', 'operation_type', 'status'], 'mr_ops_acc_type_status_idx');
            }
            if (! $this->indexExists('marketplace_return_operations', 'mr_ops_claim_created_idx')) {
                $table->index(['marketplace_return_claim_id', 'created_at'], 'mr_ops_claim_created_idx');
            }
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketplace_return_operations');
        Schema::dropIfExists('marketplace_return_claim_items');
        Schema::dropIfExists('marketplace_return_claims');
    }

    private function shrinkStringColumnForMySqlIndex(string $table, string $column): void
    {
        if (DB::getDriverName() !== 'mysql' || ! Schema::hasColumn($table, $column)) {
            return;
        }

        DB::statement("ALTER TABLE `{$table}` MODIFY `{$column}` VARCHAR(191) NOT NULL");
    }

    private function indexExists(string $table, string $index): bool
    {
        return match (DB::getDriverName()) {
            'mysql' => collect(DB::select("SHOW INDEX FROM `{$table}` WHERE Key_name = ?", [$index]))->isNotEmpty(),
            'sqlite' => collect(DB::select("PRAGMA index_list('{$table}')"))
                ->contains(fn ($row) => ($row->name ?? null) === $index),
            default => false,
        };
    }
};
