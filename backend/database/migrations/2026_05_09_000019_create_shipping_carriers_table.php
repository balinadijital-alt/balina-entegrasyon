<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipping_carriers', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->string('service_class');
            $table->boolean('is_active')->default(true);
            $table->json('capabilities')->nullable();
            $table->timestamps();
        });

        $now = now();
        DB::table('shipping_carriers')->insert([
            ['code' => 'yurtici', 'name' => 'Yurtici Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\YurticiCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'aras', 'name' => 'Aras Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\ArasCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'mng', 'name' => 'MNG Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\MngCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'surat', 'name' => 'Surat Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\SuratCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'ptt', 'name' => 'PTT Kargo', 'service_class' => 'App\\Services\\Shipping\\Providers\\PttCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'hepsijet', 'name' => 'Hepsijet', 'service_class' => 'App\\Services\\Shipping\\Providers\\HepsijetCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'trendyol_express', 'name' => 'Trendyol Express', 'service_class' => 'App\\Services\\Shipping\\Providers\\TrendyolExpressCargoService', 'capabilities' => json_encode(['barcode', 'tracking', 'label', 'return']), 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('shipping_carriers');
    }
};
