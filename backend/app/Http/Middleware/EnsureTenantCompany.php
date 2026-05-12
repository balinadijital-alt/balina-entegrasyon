<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureTenantCompany
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user || $user->hasRole('super_admin')) {
            return $next($request);
        }

        if (! $user->company_id) {
            abort(403, 'Kullanici herhangi bir firmaya bagli degil.');
        }

        if ($request->filled('company_id') && (int) $request->input('company_id') !== (int) $user->company_id) {
            abort(403, 'Baska firmaya ait veriye erisim engellendi.');
        }

        $request->attributes->set('tenant_company_id', (int) $user->company_id);
        $request->merge(['company_id' => (int) $user->company_id]);

        foreach ($request->route()?->parameters() ?? [] as $parameter) {
            if (is_object($parameter) && method_exists($parameter, 'getAttribute') && $parameter->getAttribute('company_id')) {
                if ((int) $parameter->getAttribute('company_id') !== (int) $user->company_id) {
                    abort(403, 'Baska firmaya ait veriye erisim engellendi.');
                }
            }
        }

        return $next($request);
    }
}
