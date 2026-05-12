<?php

namespace App\Services\Marketplaces;

use App\Models\ApiLog;
use App\Models\MarketplaceAccount;
use App\Services\Marketplaces\Contracts\MarketplaceService;
use Closure;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\RateLimiter;
use Throwable;

abstract class AbstractMarketplaceService implements MarketplaceService
{
    protected function loggedRequest(MarketplaceAccount $account, string $method, string $endpoint, array $payload, Closure $callback): ?Response
    {
        $startedAt = microtime(true);

        try {
            /** @var Response $response */
            $response = $callback();

            $this->log($account, $method, $endpoint, $payload, $response->status(), $response->json(), $startedAt);

            return $response;
        } catch (Throwable $exception) {
            $this->log($account, $method, $endpoint, $payload, null, null, $startedAt, $exception->getMessage());
            throw $exception;
        }
    }

    protected function throttle(MarketplaceAccount $account, ?string $scope = null): void
    {
        $key = "marketplace:{$account->code}:{$account->id}:".md5($scope ?: 'global');
        $maxAttempts = (int) config("marketplaces.{$account->code}.rate_limit_attempts", 30);
        $decay = (int) config("marketplaces.{$account->code}.rate_limit_decay", 60);

        while (RateLimiter::tooManyAttempts($key, $maxAttempts)) {
            sleep(max(1, RateLimiter::availableIn($key)));
        }

        RateLimiter::hit($key, $decay);
    }

    protected function log(MarketplaceAccount $account, string $method, string $endpoint, array $request, ?int $status, mixed $response, float $startedAt, ?string $error = null): void
    {
        ApiLog::create([
            'company_id' => $account->company_id,
            'marketplace_code' => $account->code,
            'direction' => 'outbound',
            'method' => $method,
            'endpoint' => $endpoint,
            'status_code' => $status,
            'request_payload' => $request,
            'response_payload' => is_array($response) ? $response : null,
            'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
            'error_message' => $error,
        ]);
    }
}
