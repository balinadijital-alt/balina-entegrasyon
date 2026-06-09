<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->createCatalogTables();
        $this->createOperationalTables();
        $this->createSaasTables();
        $this->createSettingsTables();
        $this->seedLookups();
    }

    public function down(): void
    {
        //
    }

    private function createCatalogTables(): void
    {
        if (! Schema::hasTable('xml_sources')) {
            Schema::create('xml_sources', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('supplier_name')->nullable();
                $table->text('url');
                $table->text('username')->nullable();
                $table->text('password')->nullable();
                $table->unsignedInteger('frequency_minutes')->default(1440);
                $table->json('field_mapping')->nullable();
                $table->json('options')->nullable();
                $table->string('last_status')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamp('last_import_at')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['company_id', 'is_active']);
            });
        }
    }

    private function createOperationalTables(): void
    {
        if (! Schema::hasTable('shipping_carriers')) {
            Schema::create('shipping_carriers', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name');
                $table->string('service_class');
                $table->boolean('is_active')->default(true);
                $table->json('capabilities')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('shipping_accounts')) {
            Schema::create('shipping_accounts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained()->cascadeOnDelete();
                $table->foreignId('shipping_carrier_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->string('customer_code')->nullable();
                $table->text('username')->nullable();
                $table->text('password')->nullable();
                $table->text('api_key')->nullable();
                $table->text('api_secret')->nullable();
                $table->text('base_url')->nullable();
                $table->json('settings')->nullable();
                $table->string('last_status')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamp('last_checked_at')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['company_id', 'shipping_carrier_id']);
            });
        }

        if (! Schema::hasTable('shipments')) {
            Schema::create('shipments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_id')->constrained()->cascadeOnDelete();
                $table->foreignId('shipping_account_id')->constrained()->cascadeOnDelete();
                $table->string('carrier_code', 80);
                $table->string('status', 80)->default('queued');
                $table->string('barcode')->nullable();
                $table->string('tracking_number', 120)->nullable();
                $table->string('label_path')->nullable();
                $table->text('label_url')->nullable();
                $table->string('return_code')->nullable();
                $table->string('last_action')->nullable();
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamp('shipped_at')->nullable();
                $table->timestamp('delivered_at')->nullable();
                $table->timestamps();

                $table->index(['order_id', 'status']);
                $table->index(['carrier_code', 'tracking_number']);
            });
        }

        if (! Schema::hasTable('payment_providers')) {
            Schema::create('payment_providers', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name');
                $table->string('service_class');
                $table->json('capabilities')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('payment_accounts')) {
            Schema::create('payment_accounts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained()->cascadeOnDelete();
                $table->foreignId('payment_provider_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->text('merchant_id')->nullable();
                $table->text('api_key')->nullable();
                $table->text('api_secret')->nullable();
                $table->text('client_id')->nullable();
                $table->text('client_secret')->nullable();
                $table->text('base_url')->nullable();
                $table->text('webhook_secret')->nullable();
                $table->json('installment_rates')->nullable();
                $table->json('commission_rates')->nullable();
                $table->json('settings')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['company_id', 'payment_provider_id']);
            });
        }

        if (! Schema::hasTable('payments')) {
            Schema::create('payments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('order_id')->constrained()->cascadeOnDelete();
                $table->foreignId('payment_account_id')->nullable()->constrained()->nullOnDelete();
                $table->string('provider_code', 80);
                $table->string('method', 80)->default('card');
                $table->string('status', 80)->default('pending');
                $table->decimal('amount', 12, 2);
                $table->decimal('refunded_amount', 12, 2)->default(0);
                $table->unsignedTinyInteger('installment_count')->default(1);
                $table->decimal('commission_rate', 8, 4)->default(0);
                $table->decimal('commission_amount', 12, 2)->default(0);
                $table->string('currency', 3)->default('TRY');
                $table->string('conversation_id', 191)->nullable()->index();
                $table->string('transaction_id', 191)->nullable()->index();
                $table->text('payment_url')->nullable();
                $table->text('three_d_html')->nullable();
                $table->json('request_payload')->nullable();
                $table->json('response_payload')->nullable();
                $table->text('error_message')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('failed_at')->nullable();
                $table->timestamps();

                $table->index(['order_id', 'status']);
                $table->index(['provider_code', 'status']);
            });
        }

        if (! Schema::hasTable('payment_logs')) {
            Schema::create('payment_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('payment_account_id')->nullable()->constrained()->nullOnDelete();
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

        if (! Schema::hasTable('accounting_integrations')) {
            Schema::create('accounting_integrations', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name');
                $table->string('service_class');
                $table->json('capabilities')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('accounting_accounts')) {
            Schema::create('accounting_accounts', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained()->cascadeOnDelete();
                $table->foreignId('accounting_integration_id')->constrained()->cascadeOnDelete();
                $table->string('name');
                $table->text('client_id')->nullable();
                $table->text('client_secret')->nullable();
                $table->text('username')->nullable();
                $table->text('password')->nullable();
                $table->text('api_key')->nullable();
                $table->text('api_secret')->nullable();
                $table->text('base_url')->nullable();
                $table->json('settings')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->index(['company_id', 'accounting_integration_id']);
            });
        }

        if (! Schema::hasTable('webhook_delivery_logs')) {
            Schema::create('webhook_delivery_logs', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
                $table->uuid('delivery_id')->unique();
                $table->string('event', 120)->index();
                $table->string('endpoint');
                $table->json('payload')->nullable();
                $table->unsignedSmallInteger('response_code')->nullable();
                $table->json('response_body')->nullable();
                $table->string('status', 80)->default('queued')->index();
                $table->boolean('success')->default(false);
                $table->unsignedSmallInteger('attempts')->default(0);
                $table->timestamp('delivered_at')->nullable();
                $table->timestamp('failed_at')->nullable();
                $table->text('last_error')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'created_at']);
            });
        }
    }

    private function createSaasTables(): void
    {
        if (! Schema::hasTable('saas_plans')) {
            Schema::create('saas_plans', function (Blueprint $table) {
                $table->id();
                $table->string('code', 80)->unique();
                $table->string('name');
                $table->decimal('monthly_price', 12, 2)->default(0);
                $table->json('limits');
                $table->json('features')->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('subscriptions')) {
            Schema::create('subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->constrained()->cascadeOnDelete();
                $table->foreignId('saas_plan_id')->constrained()->cascadeOnDelete();
                $table->foreignId('payment_id')->nullable()->constrained()->nullOnDelete();
                $table->string('status', 80)->default('trial');
                $table->timestamp('trial_ends_at')->nullable();
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();

                $table->index(['company_id', 'status']);
            });
        }

        if (! Schema::hasTable('license_keys')) {
            Schema::create('license_keys', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->nullable()->constrained()->nullOnDelete();
                $table->foreignId('saas_plan_id')->constrained()->cascadeOnDelete();
                $table->string('key', 191)->unique();
                $table->string('status', 80)->default('available');
                $table->timestamp('activated_at')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('partners')) {
            Schema::create('partners', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('email')->nullable();
                $table->string('phone')->nullable();
                $table->string('code', 120)->unique();
                $table->decimal('commission_rate', 8, 4)->default(0);
                $table->string('status', 80)->default('active');
                $table->json('metadata')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('companies') && ! Schema::hasColumn('companies', 'partner_id')) {
            Schema::table('companies', function (Blueprint $table) {
                $table->unsignedBigInteger('partner_id')->nullable()->after('id')->index();
            });
        }
    }

    private function createSettingsTables(): void
    {
        if (! Schema::hasTable('company_settings')) {
            Schema::create('company_settings', function (Blueprint $table) {
                $table->id();
                $table->foreignId('company_id')->nullable()->unique()->constrained()->nullOnDelete();
                $table->json('settings')->nullable();
                $table->timestamps();
            });
        }

        if (Schema::hasTable('payment_logs')) {
            $this->addColumnIfMissing('payment_logs', 'request_id', fn (Blueprint $table) => $table->string('request_id', 191)->nullable()->index());
            $this->addColumnIfMissing('payment_logs', 'correlation_id', fn (Blueprint $table) => $table->string('correlation_id', 191)->nullable()->index());
            $this->addColumnIfMissing('payment_logs', 'idempotency_key', fn (Blueprint $table) => $table->string('idempotency_key', 191)->nullable()->index());
            $this->addColumnIfMissing('payment_logs', 'signature_valid', fn (Blueprint $table) => $table->boolean('signature_valid')->nullable());
            $this->addColumnIfMissing('payment_logs', 'provider_timestamp', fn (Blueprint $table) => $table->timestamp('provider_timestamp')->nullable());
        }

        if (Schema::hasTable('webhook_delivery_logs')) {
            $this->addColumnIfMissing('webhook_delivery_logs', 'request_id', fn (Blueprint $table) => $table->string('request_id', 191)->nullable()->index());
            $this->addColumnIfMissing('webhook_delivery_logs', 'correlation_id', fn (Blueprint $table) => $table->string('correlation_id', 191)->nullable()->index());
        }
    }

    private function addColumnIfMissing(string $table, string $column, Closure $definition): void
    {
        if (Schema::hasColumn($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $table) use ($definition) {
            $definition($table);
        });
    }

    private function seedLookups(): void
    {
        $now = now();

        foreach ($this->shippingCarriers($now) as $carrier) {
            DB::table('shipping_carriers')->updateOrInsert(['code' => $carrier['code']], $carrier);
        }

        foreach ($this->paymentProviders($now) as $provider) {
            DB::table('payment_providers')->updateOrInsert(['code' => $provider['code']], $provider);
        }

        foreach ($this->accountingIntegrations($now) as $integration) {
            DB::table('accounting_integrations')->updateOrInsert(['code' => $integration['code']], $integration);
        }

        foreach ($this->saasPlans($now) as $plan) {
            DB::table('saas_plans')->updateOrInsert(['code' => $plan['code']], $plan);
        }
    }

    private function shippingCarriers($now): array
    {
        return [
            ['code' => 'yurtici', 'name' => 'Yurtici Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\YurticiCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'aras', 'name' => 'Aras Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\ArasCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'mng', 'name' => 'MNG Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\MngCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'surat', 'name' => 'Surat Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\SuratCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'ptt', 'name' => 'PTT Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\PttCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'hepsijet', 'name' => 'Hepsijet', 'service_class' => 'App\\Services\\Shipping\\Providers\\HepsijetCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'trendyol_express', 'name' => 'Trendyol Express', 'service_class' => 'App\\Services\\Shipping\\Providers\\TrendyolExpressCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ];
    }

    private function paymentProviders($now): array
    {
        return [
            ['code' => 'iyzico', 'name' => 'iyzico', 'service_class' => 'App\\Services\\Payments\\Providers\\IyzicoPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'paytr', 'name' => 'PayTR', 'service_class' => 'App\\Services\\Payments\\Providers\\PaytrPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'param', 'name' => 'Param', 'service_class' => 'App\\Services\\Payments\\Providers\\ParamPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'sipay', 'name' => 'Sipay', 'service_class' => 'App\\Services\\Payments\\Providers\\SipayPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'paynet', 'name' => 'Paynet', 'service_class' => 'App\\Services\\Payments\\Providers\\PaynetPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'bank_pos', 'name' => 'Banka POS', 'service_class' => 'App\\Services\\Payments\\Providers\\BankPosPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'bank_transfer', 'name' => 'Havale/EFT', 'service_class' => 'App\\Services\\Payments\\Providers\\OfflinePaymentService', 'capabilities' => json_encode(['manual']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'cash_on_delivery', 'name' => 'Kapida Odeme', 'service_class' => 'App\\Services\\Payments\\Providers\\OfflinePaymentService', 'capabilities' => json_encode(['manual']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ];
    }

    private function accountingIntegrations($now): array
    {
        return [
            ['code' => 'parasut', 'name' => 'Parasut', 'service_class' => 'App\\Services\\Accounting\\Providers\\ParasutAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'logo', 'name' => 'Logo', 'service_class' => 'App\\Services\\Accounting\\Providers\\LogoAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'mikro', 'name' => 'Mikro', 'service_class' => 'App\\Services\\Accounting\\Providers\\MikroAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'nebim', 'name' => 'Nebim', 'service_class' => 'App\\Services\\Accounting\\Providers\\NebimAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'qnb_efinans', 'name' => 'QNB e-Finans', 'service_class' => 'App\\Services\\Accounting\\Providers\\QnbEFinansAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ];
    }

    private function saasPlans($now): array
    {
        return [
            ['code' => 'starter', 'name' => 'Baslangic', 'monthly_price' => 499, 'limits' => json_encode(['products' => 500, 'users' => 3, 'marketplaces' => 2, 'xml_sources' => 2, 'orders' => 1000]), 'features' => json_encode(['Temel pazaryeri entegrasyonu', 'Excel import']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'professional', 'name' => 'Profesyonel', 'monthly_price' => 1499, 'limits' => json_encode(['products' => 5000, 'users' => 10, 'marketplaces' => 6, 'xml_sources' => 10, 'orders' => 10000]), 'features' => json_encode(['Queue sync', 'XML import', 'Kargo ve POS']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'enterprise', 'name' => 'Kurumsal', 'monthly_price' => 4999, 'limits' => json_encode(['products' => 0, 'users' => 0, 'marketplaces' => 0, 'xml_sources' => 0, 'orders' => 0]), 'features' => json_encode(['Limitsiz kullanim', 'Oncelikli destek', 'Ozel entegrasyon']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ];
    }
};
