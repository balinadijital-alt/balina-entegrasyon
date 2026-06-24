<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('marketplace_accounts')) {
            Schema::table('marketplace_accounts', function (Blueprint $table) {
                try {
                    $this->dropIndexIfExists($table->getTable(), 'marketplace_accounts_company_id_code_unique', 'unique');
                } catch (\Throwable) {
                    // Some production MySQL variants require this index for existing FK constraints.
                }

                $this->addIndexIfMissing($table->getTable(), 'marketplace_accounts_company_id_code_index', fn () => $table->index(['company_id', 'code'], 'marketplace_accounts_company_id_code_index'));
            });
        }

        if (Schema::hasTable('marketplace_publish_drafts')) {
            Schema::table('marketplace_publish_drafts', function (Blueprint $table) {
                $this->addColumnIfMissing($table, 'operation_name', fn (Blueprint $table) => $table->string('operation_name')->nullable()->after('marketplace_code'));
                $this->addColumnIfMissing($table, 'operation_type', fn (Blueprint $table) => $table->string('operation_type', 80)->default('product_send')->after('operation_name'));
                $this->addColumnIfMissing($table, 'schedule', fn (Blueprint $table) => $table->string('schedule', 80)->default('manual')->after('operation_type'));
                $this->addColumnIfMissing($table, 'operation_filters', fn (Blueprint $table) => $table->json('operation_filters')->nullable()->after('price_controls'));
                $this->addColumnIfMissing($table, 'batch_request_id', fn (Blueprint $table) => $table->string('batch_request_id')->nullable()->after('result_summary'));
                $this->addColumnIfMissing($table, 'last_run_at', fn (Blueprint $table) => $table->timestamp('last_run_at')->nullable()->after('sent_at'));
                $this->addColumnIfMissing($table, 'next_run_at', fn (Blueprint $table) => $table->timestamp('next_run_at')->nullable()->after('last_run_at'));
            });
        }

        if (Schema::hasTable('product_marketplace_statuses')) {
            Schema::table('product_marketplace_statuses', function (Blueprint $table) {
                $this->dropIndexIfExists($table->getTable(), 'product_marketplace_statuses_product_id_marketplace_code_unique', 'unique');
                $this->addColumnIfMissing($table, 'marketplace_account_id', fn (Blueprint $table) => $table->unsignedBigInteger('marketplace_account_id')->nullable()->after('product_id'));
                $this->addColumnIfMissing($table, 'provider_state', fn (Blueprint $table) => $table->string('provider_state', 80)->nullable()->after('readiness_status'));
                $this->addUniqueIfMissing($table->getTable(), 'product_marketplace_statuses_product_marketplace_account_unique', fn () => $table->unique(['product_id', 'marketplace_code', 'marketplace_account_id'], 'product_marketplace_statuses_product_marketplace_account_unique'));
            });

            $this->backfillMarketplaceAccountIds();
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('product_marketplace_statuses')) {
            Schema::table('product_marketplace_statuses', function (Blueprint $table) {
                $this->dropIndexIfExists($table->getTable(), 'product_marketplace_statuses_product_marketplace_account_unique', 'unique');

                if (Schema::hasColumn($table->getTable(), 'marketplace_account_id')) {
                    $table->dropColumn('marketplace_account_id');
                }

                if (Schema::hasColumn($table->getTable(), 'provider_state')) {
                    $table->dropColumn('provider_state');
                }

                $this->addUniqueIfMissing($table->getTable(), 'product_marketplace_statuses_product_id_marketplace_code_unique', fn () => $table->unique(['product_id', 'marketplace_code']));
            });
        }

        if (Schema::hasTable('marketplace_accounts')) {
            Schema::table('marketplace_accounts', function (Blueprint $table) {
                $this->dropIndexIfExists($table->getTable(), 'marketplace_accounts_company_id_code_index', 'index');
                if (! $this->marketplaceAccountDuplicatesExist()) {
                    $this->addUniqueIfMissing($table->getTable(), 'marketplace_accounts_company_id_code_unique', fn () => $table->unique(['company_id', 'code']));
                }
            });
        }

        if (Schema::hasTable('marketplace_publish_drafts')) {
            Schema::table('marketplace_publish_drafts', function (Blueprint $table) {
                foreach (['operation_name', 'operation_type', 'schedule', 'operation_filters', 'batch_request_id', 'last_run_at', 'next_run_at'] as $column) {
                    if (Schema::hasColumn($table->getTable(), $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }
    }

    private function addColumnIfMissing(Blueprint $table, string $column, \Closure $definition): void
    {
        if (Schema::hasColumn($table->getTable(), $column)) {
            return;
        }

        $definition($table);
    }

    private function addUniqueIfMissing(string $table, string $index, \Closure $definition): void
    {
        if ($this->indexExists($table, $index)) {
            return;
        }

        $definition();
    }

    private function addIndexIfMissing(string $table, string $index, \Closure $definition): void
    {
        if ($this->indexExists($table, $index)) {
            return;
        }

        $definition();
    }

    private function dropIndexIfExists(string $table, string $index, string $type): void
    {
        if (! $this->indexExists($table, $index)) {
            return;
        }

        Schema::table($table, function (Blueprint $table) use ($index, $type) {
            match ($type) {
                'foreign' => $table->dropForeign($index),
                'index' => $table->dropIndex($index),
                default => $table->dropUnique($index),
            };
        });
    }

    private function indexExists(string $table, string $index): bool
    {
        return collect(Schema::getIndexes($table))
            ->contains(fn (array $item) => ($item['name'] ?? null) === $index);
    }

    private function backfillMarketplaceAccountIds(): void
    {
        if (! Schema::hasColumn('product_marketplace_statuses', 'marketplace_account_id')) {
            return;
        }

        DB::table('product_marketplace_statuses')
            ->join('products', 'products.id', '=', 'product_marketplace_statuses.product_id')
            ->select('product_marketplace_statuses.id as status_id', 'products.company_id', 'product_marketplace_statuses.marketplace_code')
            ->orderBy('product_marketplace_statuses.id')
            ->chunkById(100, function ($statuses) {
                foreach ($statuses as $status) {
                    $accounts = DB::table('marketplace_accounts')
                        ->where('company_id', $status->company_id)
                        ->where('code', $status->marketplace_code)
                        ->pluck('id');

                    if ($accounts->count() === 1) {
                        DB::table('product_marketplace_statuses')
                            ->where('id', $status->status_id)
                            ->update(['marketplace_account_id' => $accounts->first()]);
                    }
                }
            }, 'product_marketplace_statuses.id', 'status_id');
    }

    private function marketplaceAccountDuplicatesExist(): bool
    {
        return DB::table('marketplace_accounts')
            ->select('company_id', 'code')
            ->groupBy('company_id', 'code')
            ->havingRaw('COUNT(*) > 1')
            ->exists();
    }
};
