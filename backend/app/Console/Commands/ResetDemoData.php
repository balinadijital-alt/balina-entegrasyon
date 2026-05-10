<?php

namespace App\Console\Commands;

use App\Models\AccountingLog;
use App\Models\ApiLog;
use App\Models\Company;
use App\Models\Order;
use App\Models\PaymentLog;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ResetDemoData extends Command
{
    protected $signature = 'demo:reset {--seed : Resetledikten sonra demo veriyi yeniden olustur}';

    protected $description = 'Remove demo company data and optionally rebuild the local demo dataset.';

    public function handle(): int
    {
        DB::transaction(function () {
            $company = Company::where('tax_number', 'DEMO0000000')->first();

            if ($company) {
                $orderIds = Order::where('company_id', $company->id)->pluck('id');

                PaymentLog::whereIn('payment_id', function ($query) use ($orderIds) {
                    $query->select('id')->from('payments')->whereIn('order_id', $orderIds);
                })->delete();

                AccountingLog::whereIn('invoice_id', function ($query) use ($orderIds) {
                    $query->select('id')->from('invoices')->whereIn('order_id', $orderIds);
                })->delete();

                ApiLog::where('company_id', $company->id)->delete();
                $company->delete();
            }

            ApiLog::where('endpoint', 'like', '/demo/api/%')->delete();
        });

        $this->info('Demo verileri temizlendi.');

        if ($this->option('seed')) {
            $this->call('db:seed', ['--class' => 'Database\\Seeders\\DemoSeeder']);
        }

        return self::SUCCESS;
    }
}
