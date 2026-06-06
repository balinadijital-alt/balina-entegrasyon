<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('api_logs', function (Blueprint $table) {
            $table->string('request_id')->nullable()->index();
            $table->string('correlation_id')->nullable()->index();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->string('request_id')->nullable()->index();
            $table->string('correlation_id')->nullable()->index();
        });

        Schema::table('inbound_webhook_deliveries', function (Blueprint $table) {
            $table->string('request_id')->nullable()->index();
            $table->string('correlation_id')->nullable()->index();
            $table->string('business_event_key')->nullable()->index();
            $table->string('body_sha256')->nullable()->index();
            $table->string('source_ip')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamp('provider_timestamp')->nullable();
            $table->timestamp('received_at')->nullable();
        });

        Schema::table('payment_logs', function (Blueprint $table) {
            $table->string('request_id')->nullable()->index();
            $table->string('correlation_id')->nullable()->index();
            $table->string('idempotency_key')->nullable()->index();
            $table->boolean('signature_valid')->nullable();
            $table->timestamp('provider_timestamp')->nullable();
        });

        Schema::table('webhook_delivery_logs', function (Blueprint $table) {
            $table->string('request_id')->nullable()->index();
            $table->string('correlation_id')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('webhook_delivery_logs', function (Blueprint $table) {
            $table->dropColumn(['request_id', 'correlation_id']);
        });

        Schema::table('payment_logs', function (Blueprint $table) {
            $table->dropColumn(['request_id', 'correlation_id', 'idempotency_key', 'signature_valid', 'provider_timestamp']);
        });

        Schema::table('inbound_webhook_deliveries', function (Blueprint $table) {
            $table->dropColumn([
                'request_id',
                'correlation_id',
                'business_event_key',
                'body_sha256',
                'source_ip',
                'user_agent',
                'provider_timestamp',
                'received_at',
            ]);
        });

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropColumn(['request_id', 'correlation_id']);
        });

        Schema::table('api_logs', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
            $table->dropColumn(['request_id', 'correlation_id']);
        });
    }
};
