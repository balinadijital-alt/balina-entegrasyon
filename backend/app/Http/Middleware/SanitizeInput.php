<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class SanitizeInput
{
    private array $sensitive = ['password', 'password_confirmation', 'api_key', 'api_secret', 'client_secret', 'webhook_secret'];

    public function handle(Request $request, Closure $next)
    {
        $request->merge($this->clean($request->all()));

        return $next($request);
    }

    private function clean(array $payload): array
    {
        foreach ($payload as $key => $value) {
            if (in_array($key, $this->sensitive, true)) {
                continue;
            }
            $payload[$key] = is_array($value) ? $this->clean($value) : (is_string($value) ? trim($value) : $value);
        }

        return $payload;
    }
}
