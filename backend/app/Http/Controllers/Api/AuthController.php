<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = User::create($data);
        $user->assignRole('company_admin');

        return response()->json([
            'user' => $user->load('roles', 'company:id,name'),
            'token' => $user->createToken('admin-panel')->plainTextToken,
            'panel' => $this->panelFor($user),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        if (RateLimiter::tooManyAttempts($this->throttleKey($request), (int) env('LOGIN_RATE_LIMIT_PER_MINUTE', 5))) {
            throw ValidationException::withMessages([
                'email' => ['Cok fazla giris denemesi. Lutfen daha sonra tekrar deneyin.'],
            ]);
        }

        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = User::where('email', $data['email'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($this->throttleKey($request), 60);
            throw ValidationException::withMessages([
                'email' => ['Giris bilgileri hatali.'],
            ]);
        }

        RateLimiter::clear($this->throttleKey($request));

        return response()->json([
            'user' => $user->load('roles', 'company:id,name'),
            'token' => $user->createToken('admin-panel')->plainTextToken,
            'panel' => $this->panelFor($user),
        ]);
    }

    private function throttleKey(Request $request): string
    {
        return strtolower((string) $request->input('email')).'|'.$request->ip();
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json($request->user()->load('roles', 'permissions', 'company:id,name'));
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()?->delete();

        return response()->json(['message' => 'Oturum kapatildi.']);
    }

    private function panelFor(User $user): string
    {
        return $user->hasRole('super_admin') ? '/admin' : '/app';
    }
}
