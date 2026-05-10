<?php

namespace App\Services\Audit;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

class AuditLogger
{
    public function log(Request $request, string $module, string $action, ?Model $model = null, ?array $old = null, ?array $new = null): void
    {
        AuditLog::create([
            'user_id' => $request->user()?->id,
            'company_id' => $new['company_id'] ?? $old['company_id'] ?? null,
            'module' => $module,
            'action' => $action,
            'auditable_type' => $model?->getMorphClass(),
            'auditable_id' => $model?->getKey(),
            'old_values' => $old,
            'new_values' => $new,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);
    }
}
