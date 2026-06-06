<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use App\Http\Middleware\RequestCorrelationMiddleware;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditLogger
{
    private const SENSITIVE_KEYS = [
        'api_secret',
        'api_key',
        'password',
        'token',
        'access_token',
        'refresh_token',
        'webhook_secret',
        'authorization',
        'secret',
        'file_content_base64',
        'three_d_html',
    ];

    public function log(Request $request, string $module, string $action, ?Model $model = null, ?array $old = null, ?array $new = null): void
    {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'company_id' => $new['company_id'] ?? $old['company_id'] ?? $this->companyId($request, $model, []),
            'module' => $module,
            'action' => $action,
            'auditable_type' => $model?->getMorphClass(),
            'auditable_id' => $model?->getKey(),
            'old_values' => $this->maskSensitive($old),
            'new_values' => $this->maskSensitive($new),
            'request_id' => $request->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => $request->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    public function logAction(
        Request $request,
        string $module,
        string $action,
        ?Model $model = null,
        array $context = [],
        ?array $old = null,
        ?array $new = null,
    ): void {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'company_id' => $this->companyId($request, $model, $context, $old, $new),
            'module' => $module,
            'action' => $action,
            'auditable_type' => $model?->getMorphClass(),
            'auditable_id' => $model?->getKey(),
            'old_values' => $this->maskSensitive($old),
            'new_values' => $this->maskSensitive(array_filter([
                'context' => $context,
                'changes' => $new,
            ], fn ($value) => $value !== null && $value !== [])),
            'request_id' => $request->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => $request->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }

    public function maskSensitive(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }

        return collect($value)
            ->mapWithKeys(function ($item, $key) {
                if (is_string($key) && $this->isSensitiveKey($key)) {
                    return [$key => $item === null ? null : '********'];
                }

                return [$key => $this->maskSensitive($item)];
            })
            ->all();
    }

    public function preserveBlankSecrets(Model $model, array $payload, array $fields): array
    {
        foreach ($fields as $field) {
            if (array_key_exists($field, $payload) && ($payload[$field] === null || $payload[$field] === '')) {
                unset($payload[$field]);
            }
        }

        return $payload;
    }

    private function companyId(Request $request, ?Model $model, array $context, ?array $old = null, ?array $new = null): ?int
    {
        $companyId = $context['company_id']
            ?? $new['company_id']
            ?? $old['company_id']
            ?? data_get($model, 'company_id')
            ?? data_get($model, 'order.company_id')
            ?? data_get($model, 'marketplace.company_id')
            ?? $request->attributes->get('tenant_company_id')
            ?? $request->user()?->company_id;

        return $companyId ? (int) $companyId : null;
    }

    private function isSensitiveKey(string $key): bool
    {
        $normalized = strtolower($key);

        return collect(self::SENSITIVE_KEYS)->contains(fn (string $sensitive) => str_contains($normalized, $sensitive));
    }
}
