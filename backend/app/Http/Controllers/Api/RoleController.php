<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Spatie\Permission\Models\Role;

class RoleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $roles = Role::with('permissions')
            ->when(! $request->user()?->hasRole('super_admin'), fn ($query) => $query->where('name', '!=', 'super_admin'))
            ->get();

        return response()->json($roles);
    }

    public function assign(Request $request, User $user): JsonResponse
    {
        if (! $request->user()?->hasRole('super_admin')) {
            if ((int) $user->company_id !== (int) $request->user()?->company_id) {
                abort(403, 'Baska firmaya ait kullanicinin rolleri degistirilemez.');
            }
        }

        $data = $request->validate([
            'roles' => ['required', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        if (! $request->user()?->hasRole('super_admin') && in_array('super_admin', $data['roles'], true)) {
            abort(403, 'Super admin rolu sadece super admin tarafindan yonetilebilir.');
        }

        if ($user->hasRole('super_admin') && ! $request->user()?->hasRole('super_admin')) {
            abort(403, 'Super admin rolu sadece super admin tarafindan yonetilebilir.');
        }

        $user->syncRoles($data['roles']);

        return response()->json($user->load('roles'));
    }
}
