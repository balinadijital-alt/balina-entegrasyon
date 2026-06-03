<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    private const ROLE_PERMISSIONS = [
        'super_admin' => ['*'],
        'company_admin' => [
            'companies.manage',
            'users.manage',
            'roles.manage',
            'settings.manage',
            'products.manage',
            'imports.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'orders.manage',
            'payments.manage',
            'payments.refund',
            'shipping.manage',
            'shipping.labels',
            'accounting.manage',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'executive.view',
            'logs.view',
            'modules.manage',
        ],
        'operator' => [
            'products.manage',
            'imports.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'orders.manage',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'logs.view',
        ],
        'company_operator' => [
            'products.manage',
            'imports.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'orders.manage',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'logs.view',
        ],
        'finance' => [
            'payments.manage',
            'payments.refund',
            'accounting.manage',
            'analytics.view',
            'logs.view',
        ],
        'warehouse' => [
            'shipping.manage',
            'shipping.labels',
            'orders.manage',
            'analytics.view',
        ],
        'support' => [
            'analytics.view',
            'logs.view',
            'queue.view',
        ],
    ];

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $user = $request->user();

        if (! $user) {
            abort(403, 'Bu islem icin yetkiniz bulunmuyor.');
        }

        foreach ($permissions as $permission) {
            if ($this->userCan($user, $permission)) {
                return $next($request);
            }
        }

        abort(403, 'Bu islem icin yetkiniz bulunmuyor.');
    }

    private function userCan($user, string $permission): bool
    {
        if ($user->hasRole('super_admin')) {
            return true;
        }

        if ($user->can($permission)) {
            return true;
        }

        foreach ($user->roles as $role) {
            $defaults = self::ROLE_PERMISSIONS[$role->name] ?? [];
            if (in_array('*', $defaults, true) || in_array($permission, $defaults, true)) {
                return true;
            }
        }

        return false;
    }
}
