<?php

namespace Database\Seeders;

use App\Models\AccountingAccount;
use App\Models\AccountingIntegration;
use App\Models\AccountingLog;
use App\Models\ApiLog;
use App\Models\Company;
use App\Models\CurrentAccount;
use App\Models\CurrentAccountTransaction;
use App\Models\Invoice;
use App\Models\MarketplaceAccount;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Models\PaymentProvider;
use App\Models\Product;
use App\Models\SaasPlan;
use App\Models\Shipment;
use App\Models\ShippingAccount;
use App\Models\ShippingCarrier;
use App\Models\Subscription;
use App\Models\UsageCounter;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        DB::transaction(function () {
            $company = Company::updateOrCreate(
                ['tax_number' => 'DEMO0000000'],
                [
                    'name' => 'Balina Demo Magaza',
                    'email' => 'demo@balina.local',
                    'phone' => '+90 212 000 00 00',
                    'address' => 'Maslak, Istanbul',
                    'is_active' => true,
                ]
            );

            $this->seedAccounts($company);
            $products = $this->seedProducts($company);
            $current = $this->seedCurrentAccount($company);
            $orders = $this->seedOrders($company, $products, $current);
            $this->seedOperations($company, $orders, $current);
            $this->seedSaas($company);
            $this->seedApiLogs($company);
        });
    }

    private function seedAccounts(Company $company): void
    {
        foreach (['trendyol' => 'Trendyol Demo', 'hepsiburada' => 'Hepsiburada Demo'] as $code => $name) {
            MarketplaceAccount::updateOrCreate(
                ['company_id' => $company->id, 'code' => $code],
                [
                    'name' => $name,
                    'supplier_id' => 'demo-supplier',
                    'merchant_id' => 'demo-merchant',
                    'api_key' => 'demo-api-key',
                    'api_secret' => 'demo-api-secret',
                    'service_username' => 'demo-user',
                    'service_password' => 'demo-pass',
                    'is_active' => true,
                    'connection_status' => 'connected',
                    'connection_checked_at' => now()->subMinutes(18),
                    'last_product_sync_at' => now()->subHours(2),
                    'last_price_sync_at' => now()->subMinutes(45),
                    'last_order_sync_at' => now()->subMinutes(20),
                ]
            );
        }

        $carrier = ShippingCarrier::where('code', 'yurtici')->first();
        if ($carrier) {
            ShippingAccount::updateOrCreate(
                ['company_id' => $company->id, 'shipping_carrier_id' => $carrier->id],
                [
                    'name' => 'Demo Yurtici Kargo',
                    'customer_code' => 'DEMO-CARGO',
                    'username' => 'demo',
                    'password' => 'demo',
                    'base_url' => 'https://sandbox.kargo.local',
                    'last_status' => 'connected',
                    'last_checked_at' => now()->subMinutes(30),
                    'is_active' => true,
                ]
            );
        }

        $provider = PaymentProvider::where('code', 'iyzico')->first();
        if ($provider) {
            PaymentAccount::updateOrCreate(
                ['company_id' => $company->id, 'payment_provider_id' => $provider->id],
                [
                    'name' => 'Demo iyzico POS',
                    'merchant_id' => 'demo-merchant',
                    'api_key' => 'demo-key',
                    'api_secret' => 'demo-secret',
                    'base_url' => 'https://sandbox-api.iyzipay.com',
                    'commission_rates' => ['1' => 2.49, '3' => 4.1],
                    'is_active' => true,
                ]
            );
        }

        $integration = AccountingIntegration::where('code', 'parasut')->first();
        if ($integration) {
            AccountingAccount::updateOrCreate(
                ['company_id' => $company->id, 'accounting_integration_id' => $integration->id],
                [
                    'name' => 'Demo Parasut',
                    'client_id' => 'demo-client',
                    'client_secret' => 'demo-secret',
                    'base_url' => 'https://api.parasut.local',
                    'is_active' => true,
                ]
            );
        }
    }

    private function seedProducts(Company $company): array
    {
        $catalog = [
            ['Akilli Saat Pro', 'Elektronik', 1899, 42],
            ['Bluetooth Kulaklik Air', 'Elektronik', 749, 120],
            ['Organik Pamuk Tisort', 'Giyim', 329, 85],
            ['Outdoor Sirt Cantasi', 'Spor', 649, 36],
            ['Seramik Kahve Seti', 'Ev Yasam', 459, 64],
            ['Cilt Bakim Serumu', 'Kozmetik', 279, 98],
            ['Cocuk Egitsel Blok Seti', 'Oyuncak', 399, 57],
            ['Minimal Calisma Lambasi', 'Ev Yasam', 529, 23],
            ['Yoga Mat Premium', 'Spor', 349, 44],
            ['Paslanmaz Termos', 'Outdoor', 389, 71],
            ['Kablosuz Sarj Standi', 'Elektronik', 599, 31],
            ['Keten Gomlek', 'Giyim', 699, 19],
        ];

        return collect($catalog)->map(function (array $item, int $index) use ($company) {
            return Product::updateOrCreate(
                ['company_id' => $company->id, 'sku' => 'DEMO-SKU-'.str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT)],
                [
                    'barcode' => '869000000'.str_pad((string) ($index + 1), 4, '0', STR_PAD_LEFT),
                    'name' => $item[0],
                    'description' => $item[0].' icin demo urun aciklamasi.',
                    'brand' => 'Balina Demo',
                    'category' => $item[1],
                    'price' => $item[2],
                    'list_price' => round($item[2] * 1.18, 2),
                    'stock' => $item[3],
                    'vat_rate' => 20,
                    'status' => $index % 7 === 0 ? 'draft' : 'active',
                    'last_imported_at' => now()->subDays($index % 5),
                ]
            );
        })->all();
    }

    private function seedCurrentAccount(Company $company): CurrentAccount
    {
        return CurrentAccount::updateOrCreate(
            ['company_id' => $company->id, 'code' => 'DEMO-CARI-001'],
            [
                'type' => 'customer',
                'name' => 'Demo Musteri Cari',
                'email' => 'musteri.demo@example.com',
                'phone' => '+90 555 000 00 00',
                'tax_office' => 'Maslak',
                'tax_number' => '1111111111',
                'address' => 'Demo Mahallesi, Istanbul',
                'city' => 'Istanbul',
                'district' => 'Sariyer',
                'balance' => 0,
                'is_active' => true,
            ]
        );
    }

    private function seedOrders(Company $company, array $products, CurrentAccount $current): array
    {
        return collect(range(1, 16))->map(function (int $index) use ($company, $products, $current) {
            $product = $products[($index - 1) % count($products)];
            $amount = (float) $product->price + (($index % 3) * 129);
            $order = Order::updateOrCreate(
                ['marketplace_code' => $index % 2 === 0 ? 'trendyol' : 'hepsiburada', 'marketplace_order_id' => 'DEMO-ORDER-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT)],
                [
                    'company_id' => $company->id,
                    'customer_name' => 'Demo Musteri '.$index,
                    'customer_email' => 'demo'.$index.'@example.com',
                    'total_amount' => $amount,
                    'status' => ['new', 'processing', 'shipped', 'delivered', 'cancelled'][$index % 5],
                    'payload' => ['items' => [['sku' => $product->sku, 'quantity' => 1, 'price' => $product->price]]],
                    'created_at' => now()->subDays(16 - $index),
                    'updated_at' => now()->subDays(16 - $index)->addMinutes(20),
                ]
            );

            CurrentAccountTransaction::updateOrCreate(
                ['current_account_id' => $current->id, 'order_id' => $order->id, 'type' => 'order'],
                [
                    'direction' => 'debit',
                    'amount' => $amount,
                    'currency' => 'TRY',
                    'description' => 'Demo siparis cari hareketi',
                    'transaction_date' => $order->created_at,
                    'payload' => ['demo' => true],
                ]
            );

            return $order;
        })->all();
    }

    private function seedOperations(Company $company, array $orders, CurrentAccount $current): void
    {
        $shippingAccount = ShippingAccount::where('company_id', $company->id)->first();
        $paymentAccount = PaymentAccount::where('company_id', $company->id)->first();
        $accountingAccount = AccountingAccount::where('company_id', $company->id)->first();

        foreach ($orders as $index => $order) {
            $payment = Payment::updateOrCreate(
                ['order_id' => $order->id, 'provider_code' => 'iyzico'],
                [
                    'payment_account_id' => $paymentAccount?->id,
                    'method' => 'card',
                    'status' => $index % 6 === 0 ? 'failed' : 'paid',
                    'amount' => $order->total_amount,
                    'commission_rate' => 2.49,
                    'commission_amount' => round(((float) $order->total_amount * 2.49) / 100, 2),
                    'currency' => 'TRY',
                    'conversation_id' => 'demo-conversation-'.$order->id,
                    'transaction_id' => 'demo-transaction-'.$order->id,
                    'paid_at' => $index % 6 === 0 ? null : $order->created_at->addMinutes(5),
                    'failed_at' => $index % 6 === 0 ? $order->created_at->addMinutes(5) : null,
                ]
            );

            PaymentLog::updateOrCreate(
                ['payment_id' => $payment->id, 'event' => 'demo.payment'],
                [
                    'payment_account_id' => $paymentAccount?->id,
                    'provider_code' => 'iyzico',
                    'status' => $payment->status,
                    'request_payload' => ['order_id' => $order->id],
                    'response_payload' => ['demo' => true],
                    'duration_ms' => 180 + $index,
                ]
            );

            if ($shippingAccount && $index < 12) {
                Shipment::updateOrCreate(
                    ['order_id' => $order->id, 'shipping_account_id' => $shippingAccount->id],
                    [
                        'carrier_code' => 'yurtici',
                        'status' => ['queued', 'created', 'in_transit', 'delivered'][$index % 4],
                        'barcode' => 'DEMO-BARCODE-'.$order->id,
                        'tracking_number' => 'TRK'.str_pad((string) $order->id, 8, '0', STR_PAD_LEFT),
                        'label_url' => 'https://demo.local/labels/'.$order->id.'.pdf',
                        'last_action' => 'demo_seed',
                        'shipped_at' => $index % 4 >= 2 ? $order->created_at->addDay() : null,
                        'delivered_at' => $index % 4 === 3 ? $order->created_at->addDays(3) : null,
                    ]
                );
            }

            if ($index < 10) {
                $invoice = Invoice::updateOrCreate(
                    ['order_id' => $order->id, 'invoice_number' => 'DMF'.now()->format('Y').str_pad((string) ($index + 1), 5, '0', STR_PAD_LEFT)],
                    [
                        'company_id' => $company->id,
                        'current_account_id' => $current->id,
                        'accounting_account_id' => $accountingAccount?->id,
                        'type' => 'earchive',
                        'scenario' => 'basic',
                        'status' => $index % 5 === 0 ? 'draft' : 'issued',
                        'subtotal' => round((float) $order->total_amount / 1.2, 2),
                        'tax_total' => round((float) $order->total_amount - ((float) $order->total_amount / 1.2), 2),
                        'grand_total' => $order->total_amount,
                        'currency' => 'TRY',
                        'lines' => $order->payload['items'] ?? [],
                        'pdf_url' => 'https://demo.local/invoices/'.$order->id.'.pdf',
                        'issued_at' => $index % 5 === 0 ? null : $order->created_at->addMinutes(30),
                    ]
                );

                AccountingLog::updateOrCreate(
                    ['invoice_id' => $invoice->id, 'event' => 'demo.invoice'],
                    [
                        'accounting_account_id' => $accountingAccount?->id,
                        'provider_code' => 'parasut',
                        'status' => $invoice->status,
                        'request_payload' => ['order_id' => $order->id],
                        'response_payload' => ['demo' => true],
                        'duration_ms' => 240 + $index,
                    ]
                );
            }
        }
    }

    private function seedSaas(Company $company): void
    {
        $plan = SaasPlan::where('code', 'professional')->first() ?? SaasPlan::first();
        if (! $plan) {
            return;
        }

        Subscription::updateOrCreate(
            ['company_id' => $company->id, 'saas_plan_id' => $plan->id],
            [
                'status' => 'trial',
                'trial_ends_at' => now()->addDays(10),
                'starts_at' => now()->subDays(4),
                'ends_at' => now()->addDays(26),
                'metadata' => ['demo' => true],
            ]
        );

        foreach (($plan->limits ?? []) as $metric => $limit) {
            UsageCounter::updateOrCreate(
                ['company_id' => $company->id, 'metric' => $metric],
                [
                    'used' => match ($metric) {
                        'products' => Product::where('company_id', $company->id)->count(),
                        'orders' => Order::where('company_id', $company->id)->count(),
                        'marketplaces' => MarketplaceAccount::where('company_id', $company->id)->count(),
                        'xml_sources' => 1,
                        'users' => 1,
                        default => 0,
                    },
                    'limit' => (int) $limit,
                    'period_starts_at' => now()->startOfMonth(),
                    'period_ends_at' => now()->endOfMonth(),
                ]
            );
        }
    }

    private function seedApiLogs(Company $company): void
    {
        collect(range(1, 18))->each(function (int $index) use ($company) {
            ApiLog::updateOrCreate(
                ['company_id' => $company->id, 'endpoint' => '/demo/api/'.$index],
                [
                    'marketplace_code' => $index % 2 === 0 ? 'trendyol' : 'hepsiburada',
                    'direction' => $index % 3 === 0 ? 'inbound' : 'outbound',
                    'method' => ['GET', 'POST', 'PUT'][$index % 3],
                    'status_code' => $index % 8 === 0 ? 422 : 200,
                    'request_payload' => ['demo' => true, 'index' => $index],
                    'response_payload' => ['ok' => $index % 8 !== 0],
                    'duration_ms' => 90 + ($index * 13),
                    'error_message' => $index % 8 === 0 ? 'Demo validasyon hatasi' : null,
                    'created_at' => now()->subHours($index),
                    'updated_at' => now()->subHours($index),
                ]
            );
        });
    }
}
