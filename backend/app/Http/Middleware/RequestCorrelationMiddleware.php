<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

class RequestCorrelationMiddleware
{
    public const REQUEST_ID_ATTRIBUTE = 'request_id';
    public const CORRELATION_ID_ATTRIBUTE = 'correlation_id';

    public function handle(Request $request, Closure $next): Response
    {
        $requestId = $this->headerOrUuid($request, 'X-Request-Id');
        $correlationId = $this->headerOrUuid($request, 'X-Correlation-Id', $requestId);

        $request->attributes->set(self::REQUEST_ID_ATTRIBUTE, $requestId);
        $request->attributes->set(self::CORRELATION_ID_ATTRIBUTE, $correlationId);

        Log::withContext([
            'request_id' => $requestId,
            'correlation_id' => $correlationId,
            'company_id' => $request->user()?->company_id ?: $request->attributes->get('tenant_company_id'),
            'user_id' => $request->user()?->id,
        ]);

        /** @var Response $response */
        $response = $next($request);

        $response->headers->set('X-Request-Id', $requestId);
        $response->headers->set('X-Correlation-Id', $correlationId);

        return $response;
    }

    private function headerOrUuid(Request $request, string $header, ?string $fallback = null): string
    {
        $value = trim((string) $request->header($header));

        if ($value !== '' && preg_match('/^[A-Za-z0-9_.:-]{1,128}$/', $value)) {
            return $value;
        }

        return $fallback ?: (string) Str::uuid();
    }
}
