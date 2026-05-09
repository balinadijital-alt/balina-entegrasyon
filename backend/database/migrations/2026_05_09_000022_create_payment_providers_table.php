<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_providers', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('service_class');
            $table->json('capabilities')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();
        DB::table('payment_providers')->insert([
            ['code' => 'iyzico', 'name' => 'iyzico', 'service_class' => 'App\\Services\\Payments\\Providers\\IyzicoPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'paytr', 'name' => 'PayTR', 'service_class' => 'App\\Services\\Payments\\Providers\\PaytrPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'param', 'name' => 'Param', 'service_class' => 'App\\Services\\Payments\\Providers\\ParamPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'sipay', 'name' => 'Sipay', 'service_class' => 'App\\Services\\Payments\\Providers\\SipayPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'paynet', 'name' => 'Paynet', 'service_class' => 'App\\Services\\Payments\\Providers\\PaynetPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'bank_pos', 'name' => 'Banka POS', 'service_class' => 'App\\Services\\Payments\\Providers\\BankPosPaymentService', 'capabilities' => json_encode(['payment', '3d', 'refund', 'installment']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'bank_transfer', 'name' => 'Havale/EFT', 'service_class' => 'App\\Services\\Payments\\Providers\\OfflinePaymentService', 'capabilities' => json_encode(['manual']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'cash_on_delivery', 'name' => 'Kapida Odeme', 'service_class' => 'App\\Services\\Payments\\Providers\\OfflinePaymentService', 'capabilities' => json_encode(['manual']), 'is_active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('payment_providers');
    }
};
