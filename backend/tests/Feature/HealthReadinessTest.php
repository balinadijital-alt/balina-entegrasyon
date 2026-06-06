<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HealthReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_live_endpoint_is_healthy(): void
    {
        $this->getJson('/api/health/live')
            ->assertOk()
            ->assertJsonPath('status', 'healthy')
            ->assertJsonPath('checks.app', 'ok');
    }

    public function test_ready_endpoint_returns_runtime_checks(): void
    {
        $this->getJson('/api/health/ready')
            ->assertOk()
            ->assertJsonPath('status', 'healthy')
            ->assertJsonPath('checks.database', 'ok')
            ->assertJsonPath('checks.cache', 'ok')
            ->assertJsonPath('checks.queue', 'ok')
            ->assertJsonPath('checks.storage', 'ok')
            ->assertJsonStructure(['queue' => ['backlog', 'failed_jobs'], 'scheduler' => ['last_run_at']]);
    }

    public function test_ready_endpoint_reports_degraded_when_storage_fails(): void
    {
        Storage::shouldReceive('disk')->andThrow(new \RuntimeException('storage failed'));

        $this->getJson('/api/health/ready')
            ->assertStatus(503)
            ->assertJsonPath('status', 'degraded')
            ->assertJsonPath('checks.storage', 'failed');
    }
}
