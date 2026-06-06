<?php

namespace Tests\Feature;

use App\Models\ApiLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RequestCorrelationTest extends TestCase
{
    use RefreshDatabase;

    public function test_request_and_correlation_ids_are_generated_and_returned(): void
    {
        $response = $this->getJson('/api/health/live')->assertOk();

        $this->assertNotEmpty($response->headers->get('X-Request-Id'));
        $this->assertSame($response->headers->get('X-Request-Id'), $response->headers->get('X-Correlation-Id'));
    }

    public function test_incoming_ids_are_preserved_and_written_to_api_log(): void
    {
        $this->withHeaders([
            'X-Request-Id' => 'req-test-1',
            'X-Correlation-Id' => 'corr-test-1',
        ])->getJson('/api/health/live')
            ->assertOk()
            ->assertHeader('X-Request-Id', 'req-test-1')
            ->assertHeader('X-Correlation-Id', 'corr-test-1');

        $log = ApiLog::query()->latest()->firstOrFail();
        $this->assertSame('req-test-1', $log->request_id);
        $this->assertSame('corr-test-1', $log->correlation_id);
    }
}
