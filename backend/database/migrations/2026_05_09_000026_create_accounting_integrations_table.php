<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('accounting_integrations', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('service_class');
            $table->json('capabilities')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();
        DB::table('accounting_integrations')->insert([
            ['code' => 'parasut', 'name' => 'Parasut', 'service_class' => 'App\\Services\\Accounting\\Providers\\ParasutAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'logo', 'name' => 'Logo', 'service_class' => 'App\\Services\\Accounting\\Providers\\LogoAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'mikro', 'name' => 'Mikro', 'service_class' => 'App\\Services\\Accounting\\Providers\\MikroAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'nebim', 'name' => 'Nebim', 'service_class' => 'App\\Services\\Accounting\\Providers\\NebimAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'qnb_efinans', 'name' => 'QNB e-Finans', 'service_class' => 'App\\Services\\Accounting\\Providers\\QnbEFinansAccountingService', 'capabilities' => json_encode(['invoice', 'earchive', 'einvoice']), 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('accounting_integrations');
    }
};
