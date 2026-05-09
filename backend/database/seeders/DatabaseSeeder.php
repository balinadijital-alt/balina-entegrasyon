<?php

namespace Database\Seeders;

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

        $admin = Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $operator = Role::firstOrCreate(['name' => 'operator', 'guard_name' => 'web']);

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
        $user->assignRole($admin);
    }
}
