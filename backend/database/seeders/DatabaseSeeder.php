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
            'users.manage',
            'roles.manage',
            'settings.manage',
            'products.manage',
            'imports.manage',
            'orders.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'payments.manage',
            'payments.refund',
            'shipping.manage',
            'shipping.labels',
            'accounting.manage',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'executive.view',
            'saas.manage',
            'logs.view',
            'modules.manage',
        ])->map(fn ($name) => Permission::firstOrCreate(['name' => $name, 'guard_name' => 'web']));

        $superAdmin = Role::firstOrCreate(['name' => 'super_admin', 'guard_name' => 'web']);
        $companyAdmin = Role::firstOrCreate(['name' => 'company_admin', 'guard_name' => 'web']);
        $companyOperator = Role::firstOrCreate(['name' => 'company_operator', 'guard_name' => 'web']);
        $operator = Role::firstOrCreate(['name' => 'operator', 'guard_name' => 'web']);
        $finance = Role::firstOrCreate(['name' => 'finance', 'guard_name' => 'web']);
        $warehouse = Role::firstOrCreate(['name' => 'warehouse', 'guard_name' => 'web']);
        $support = Role::firstOrCreate(['name' => 'support', 'guard_name' => 'web']);

        $superAdmin->syncPermissions($permissions);
        $companyAdmin->syncPermissions($permissions->reject(fn ($permission) => $permission->name === 'saas.manage'));
        $companyOperator->syncPermissions($permissions->whereIn('name', [
            'products.manage',
            'imports.manage',
            'orders.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'logs.view',
        ]));
        $operator->syncPermissions($permissions->whereIn('name', [
            'products.manage',
            'imports.manage',
            'orders.manage',
            'marketplaces.manage',
            'marketplaces.send',
            'queue.view',
            'queue.retry',
            'analytics.view',
            'logs.view',
        ]));
        $finance->syncPermissions($permissions->whereIn('name', [
            'payments.manage',
            'payments.refund',
            'accounting.manage',
            'analytics.view',
            'logs.view',
        ]));
        $warehouse->syncPermissions($permissions->whereIn('name', [
            'shipping.manage',
            'shipping.labels',
            'orders.manage',
            'analytics.view',
        ]));
        $support->syncPermissions($permissions->whereIn('name', [
            'analytics.view',
            'logs.view',
            'queue.view',
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
