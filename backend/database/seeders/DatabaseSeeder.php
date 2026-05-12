<?php

namespace Database\Seeders;

use App\Models\Company;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $permissions = collect([
            'companies.manage',
            'products.manage',
            'products.import',
            'orders.manage',
            'marketplaces.sync',
            'api_logs.view',
            'roles.manage',
        ])->map(fn ($name) => Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']));

        $superAdmin = Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        $companyAdmin = Role::firstOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
        $companyOperator = Role::firstOrCreate(['name' => 'company_operator', 'guard_name' => 'web']);
        $admin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $operator = Role::firstOrCreate(['name' => 'operator', 'guard_name' => 'web']);

        $superAdmin->syncPermissions($permissions);
        $companyAdmin->syncPermissions($permissions);
        $companyOperator->syncPermissions($permissions->whereIn('name', [
            'products.manage',
            'products.import',
            'orders.manage',
            'marketplaces.sync',
            'api_logs.view',
        ]));
        $admin->syncPermissions($permissions);
        $operator->syncPermissions($permissions->whereIn('name', [
            'products.manage',
            'products.import',
            'orders.manage',
            'marketplaces.sync',
            'api_logs.view',
        ]));

        $user = User::firstOrCreate(
            ['email' => 'admin@balina.local'],
            ['name' => 'Balina Admin', 'password' => Hash::make('password')]
        );
        $user->syncRoles([$superAdmin]);

        $company = Company::firstOrCreate(
            ['email' => 'demo@balina.local'],
            ['name' => 'Demo Musteri Firma', 'is_active' => true]
        );

        $customer = User::firstOrCreate(
            ['email' => 'musteri@balina.local'],
            ['company_id' => $company->id, 'name' => 'Demo Musteri Admin', 'password' => Hash::make('password')]
        );
        $customer->forceFill(['company_id' => $company->id])->save();
        $customer->syncRoles([$companyAdmin]);
    }
}
