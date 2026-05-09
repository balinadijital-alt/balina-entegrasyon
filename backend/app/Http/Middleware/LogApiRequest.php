<?php

namespace App\Http\Middleware;

use App\Models\ApiLog;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class LogApiRequest
{
    public function handle(Request $request, Closure $next): Response
    {
        $startedAt = microtime(true);

        /** @var Response $response */
        $response = $next($request);

        if (! $request->is('api/api-logs*')) {
            ApiLog::create([
                'company_id' => $request->integer('company_id') ?: null,
                'marketplace_code' => is_object($request->route('marketplace')) ? $request->route('marketplace')->code : null,
                'direction' => 'inbound',
                'method' => $request->method(),
                'endpoint' => '/'.$request->path(),
                'status_code' => $response->getStatusCode(),
                'request_payload' => $this->requestPayload($request),
                'response_payload' => null,
                'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            ]);
        }

        return $response;
    }

    private function requestPayload(Request $request): ?array
    {
        if ($request->allFiles() !== []) {
            return ['files' => array_keys($request->allFiles())];
        }

        $payload = $request->except(['password', 'password_confirmation', 'api_secret']);

        return $payload === [] ? null : $payload;
    }
}
