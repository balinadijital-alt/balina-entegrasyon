<?php

use App\Http\Controllers\Api\ApiLogController;
use App\Http\Controllers\Api\AccountingAccountController;
use App\Http\Controllers\Api\AccountingIntegrationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CategoryMappingController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\CurrentAccountController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HepsiburadaController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\MarketplaceSyncController;
use App\Http\Controllers\Api\MarketplaceAccountController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentAccountController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentProviderController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductImportController;
use App\Http\Controllers\Api\ProductImportRunController;
use App\Http\Controllers\Api\ProductImageController;
use App\Http\Controllers\Api\QueueDashboardController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SaasController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\ShippingAccountController;
use App\Http\Controllers\Api\ShippingCarrierController;
use App\Http\Controllers\Api\TrendyolController;
use App\Http\Controllers\Api\XmlSourceController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::match(['get', 'post'], '/payment-callbacks/{payment}', [PaymentController::class, 'callback']);
Route::get('/health', HealthController::class);

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/dashboard', DashboardController::class);

    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/saas/plans', [SaasController::class, 'plans']);
    Route::get('/saas/subscriptions', [SaasController::class, 'subscriptions']);
    Route::get('/companies/{company}/saas-usage', [SaasController::class, 'usage']);
    Route::post('/companies/{company}/change-plan', [SaasController::class, 'changePlan']);
    Route::post('/companies/{company}/start-trial', [SaasController::class, 'startTrial']);
    Route::get('/licenses', [SaasController::class, 'licenses']);
    Route::post('/licenses', [SaasController::class, 'createLicense']);
    Route::post('/licenses/activate', [SaasController::class, 'activateLicense']);
    Route::get('/partners', [SaasController::class, 'partners']);
    Route::post('/partners', [SaasController::class, 'createPartner']);

    Route::apiResource('companies', CompanyController::class);
    Route::apiResource('products', ProductController::class)->middleware('plan.limit:products');
    Route::post('/products/import', ProductImportController::class)->middleware('plan.limit:products');
    Route::post('/products/{product}/images', [ProductImageController::class, 'store']);
    Route::delete('/product-images/{image}', [ProductImageController::class, 'destroy']);
    Route::apiResource('xml-sources', XmlSourceController::class)
        ->parameters(['xml-sources' => 'xmlSource'])
        ->except(['show'])
        ->middleware('plan.limit:xml_sources');
    Route::post('/xml-sources/{xmlSource}/preview', [XmlSourceController::class, 'preview']);
    Route::post('/xml-sources/{xmlSource}/import', [XmlSourceController::class, 'import']);
    Route::get('/import-runs', [ProductImportRunController::class, 'index']);
    Route::get('/import-runs/{importRun}', [ProductImportRunController::class, 'show']);
    Route::post('/import-runs/preview-excel', [ProductImportRunController::class, 'previewExcel']);
    Route::post('/import-runs/excel', [ProductImportRunController::class, 'queueExcel']);
    Route::post('/import-runs/{importRun}/retry', [ProductImportRunController::class, 'retry']);

    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'update']);
    Route::get('/accounting-integrations', [AccountingIntegrationController::class, 'index']);
    Route::apiResource('accounting-accounts', AccountingAccountController::class)->parameters(['accounting-accounts' => 'accountingAccount'])->except(['show', 'destroy']);
    Route::get('/current-accounts', [CurrentAccountController::class, 'index']);
    Route::post('/current-accounts', [CurrentAccountController::class, 'store']);
    Route::get('/current-transactions', [CurrentAccountController::class, 'transactions']);
    Route::post('/current-accounts/{currentAccount}/transactions', [CurrentAccountController::class, 'addTransaction']);
    Route::get('/invoices', [InvoiceController::class, 'index']);
    Route::get('/accounting-logs', [InvoiceController::class, 'logs']);
    Route::post('/orders/{order}/invoices', [InvoiceController::class, 'createForOrder']);
    Route::post('/invoices/{invoice}/return', [InvoiceController::class, 'returnInvoice']);
    Route::post('/invoices/{invoice}/query', [InvoiceController::class, 'query']);
    Route::post('/invoices/{invoice}/pdf', [InvoiceController::class, 'pdf']);
    Route::get('/invoices/{invoice}/pdf', [InvoiceController::class, 'download']);
    Route::get('/payment-providers', [PaymentProviderController::class, 'index']);
    Route::apiResource('payment-accounts', PaymentAccountController::class)
        ->parameters(['payment-accounts' => 'paymentAccount'])
        ->except(['show']);
    Route::get('/payments', [PaymentController::class, 'index']);
    Route::get('/payment-logs', [PaymentController::class, 'logs']);
    Route::post('/orders/{order}/payments', [PaymentController::class, 'createForOrder']);
    Route::post('/payments/{payment}/query', [PaymentController::class, 'query']);
    Route::post('/payments/{payment}/refund', [PaymentController::class, 'refund']);
    Route::get('/shipping-carriers', [ShippingCarrierController::class, 'index']);
    Route::apiResource('shipping-accounts', ShippingAccountController::class)
        ->parameters(['shipping-accounts' => 'shippingAccount'])
        ->except(['show']);
    Route::get('/shipments', [ShipmentController::class, 'index']);
    Route::post('/orders/{order}/shipments', [ShipmentController::class, 'createForOrder']);
    Route::post('/shipments/bulk-labels', [ShipmentController::class, 'bulkLabels']);
    Route::post('/shipments/{shipment}/track', [ShipmentController::class, 'track']);
    Route::post('/shipments/{shipment}/label', [ShipmentController::class, 'label']);
    Route::get('/shipments/{shipment}/label', [ShipmentController::class, 'downloadLabel']);
    Route::post('/shipments/{shipment}/return-code', [ShipmentController::class, 'returnCode']);
    Route::post('/shipments/{shipment}/retry', [ShipmentController::class, 'retry']);
    Route::apiResource('marketplaces', MarketplaceAccountController::class)->middleware('plan.limit:marketplaces');
    Route::get('/category-mappings', [CategoryMappingController::class, 'index']);
    Route::post('/category-mappings', [CategoryMappingController::class, 'store']);
    Route::prefix('marketplaces/{marketplace}/trendyol')->group(function () {
        Route::post('/test', [TrendyolController::class, 'test']);
        Route::get('/categories', [TrendyolController::class, 'categories']);
        Route::post('/send-products', [TrendyolController::class, 'sendProducts']);
        Route::post('/update-price-inventory', [TrendyolController::class, 'updatePriceInventory']);
        Route::post('/pull-orders', [TrendyolController::class, 'pullOrders']);
    });
    Route::prefix('marketplaces/{marketplace}/hepsiburada')->group(function () {
        Route::post('/test', [HepsiburadaController::class, 'test']);
        Route::get('/categories', [HepsiburadaController::class, 'categories']);
        Route::post('/send-products', [HepsiburadaController::class, 'sendProducts']);
        Route::post('/update-price-inventory', [HepsiburadaController::class, 'updatePriceInventory']);
        Route::post('/pull-orders', [HepsiburadaController::class, 'pullOrders']);
    });
    Route::post('/marketplaces/{marketplace}/sync-products', [MarketplaceSyncController::class, 'syncProducts']);
    Route::post('/marketplaces/{marketplace}/sync-orders', [MarketplaceSyncController::class, 'syncOrders']);

    Route::get('/api-logs', [ApiLogController::class, 'index']);
    Route::get('/queue/status', [QueueDashboardController::class, 'index']);
    Route::post('/queue/failed/{uuid}/retry', [QueueDashboardController::class, 'retry']);
    Route::get('/roles', [RoleController::class, 'index']);
    Route::post('/users/{user}/roles', [RoleController::class, 'assign']);
});
