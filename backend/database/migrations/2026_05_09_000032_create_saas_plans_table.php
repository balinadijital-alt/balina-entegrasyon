<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('saas_plans', function (Blueprint $table) {
            $table->id();
            $table->string('code')->unique();
            $table->string('name');
            $table->decimal('monthly_price', 12, 2)->default(0);
            $table->json('limits');
            $table->json('features')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        $now = now();
        DB::table('saas_plans')->insert([
            ['code' => 'starter', 'name' => 'Baslangic', 'monthly_price' => 499, 'limits' => json_encode(['products' => 500, 'users' => 3, 'marketplaces' => 2, 'xml_sources' => 2, 'orders' => 1000]), 'features' => json_encode(['Temel pazaryeri entegrasyonu', 'Excel import']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'professional', 'name' => 'Profesyonel', 'monthly_price' => 1499, 'limits' => json_encode(['products' => 5000, 'users' => 10, 'marketplaces' => 6, 'xml_sources' => 10, 'orders' => 10000]), 'features' => json_encode(['Queue sync', 'XML import', 'Kargo ve POS']), 'created_at' => $now, 'updated_at' => $now],
            ['code' => 'enterprise', 'name' => 'Kurumsal', 'monthly_price' => 4999, 'limits' => json_encode(['products' => 0, 'users' => 0, 'marketplaces' => 0, 'xml_sources' => 0, 'orders' => 0]), 'features' => json_encode(['Limitsiz kullanim', 'Oncelikli destek', 'Ozel entegrasyon']), 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('saas_plans');
    }
};
