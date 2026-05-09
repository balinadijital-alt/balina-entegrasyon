<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CompanyController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Company::latest()->paginate(20));
    }

    public function store(Request $request): JsonResponse
    {
        $company = Company::create($this->validated($request));

        return response()->json($company, 201);
    }

    public function show(Company $company): JsonResponse
    {
        return response()->json($company->loadCount('products'));
    }

    public function update(Request $request, Company $company): JsonResponse
    {
        $company->update($this->validated($request));

        return response()->json($company);
    }

    public function destroy(Company $company): JsonResponse
    {
        $company->delete();

        return response()->json(status: 204);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'tax_number' => ['nullable', 'string', 'max:32'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:32'],
            'address' => ['nullable', 'string'],
            'is_active' => ['boolean'],
        ]);
    }
}
