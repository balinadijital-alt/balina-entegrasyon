<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sync_runs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('marketplace_account_id')->nullable()->constrained()->nullOnDelete();
            $table->string('type');
            $table->string('queue')->default('marketplace-sync');
            $table->string('job_uuid')->nullable()->index();
            $table->string('status')->default('queued')->index();
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedInteger('duration_ms')->nullable();
            $table->unsignedInteger('processed_count')->default(0);
            $table->text('message')->nullable();
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('finished_at')->nullable();
            $table->timestamps();
        });

        Schema::create('queue_notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sync_run_id')->nullable()->constrained()->nullOnDelete();
            $table->string('level')->default('info');
            $table->string('title');
            $table->text('message')->nullable();
            $table->json('payload')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('queue_notifications');
        Schema::dropIfExists('sync_runs');
    }
};
