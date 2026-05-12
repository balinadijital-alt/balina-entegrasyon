<?php

use App\Http\Controllers\Api\ApiLogController;
use App\Http\Controllers\Api\AccountingAccountController;
use App\Http\Controllers\Api\AccountingIntegrationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\B2BModuleController;
use App\Http\Controllers\Api\CategoryMappingController;
use App\Http\Controllers\Api\CatalogModuleController;
use App\Http\Controllers\Api\CmsModuleController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\CurrentAccountController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HepsiburadaController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\MarketplaceSyncController;
use App\Http\Controllers\Api\MarketplaceAccountController;
use App\Http\Controllers\Api\MarketingModuleController;
use App\Http\Controllers\Api\ModuleCrudController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\PaymentAccountController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\PaymentProviderController;
use App\Http\Controllers\Api\PricingModuleController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductImportController;
use App\Http\Controllers\Api\ProductImportRunController;
use App\Http\Controllers\Api\ProductImageController;
use App\Http\Controllers\Api\ProductMarketplaceController;
use App\Http\Controllers\Api\QueueDashboardController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SaasController;
use App\Http\Controllers\Api\SeoModuleController;
use App\Http\Controllers\Api\ShipmentController;
use App\Http\Controllers\Api\ShippingAccountController;
use App\Http\Controllers\Api\ShippingCarrierController;
use App\Http\Controllers\Api\TrendyolController;
use App\Http\Controllers\Api\WorkflowModuleController;
use App\Http\Controllers\Api\XmlSourceController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');
Route::match(['get', 'post'], '/payment-callbacks/{payment}', [PaymentController::class, 'callback']);
Route::get('/health', HealthController::class);

Route::middleware(['auth:sanctum', 'throttle:api', 'tenant.company'])->group(function () {
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
    Route::get('/products/{product}/readiness', [ProductMarketplaceController::class, 'readiness']);
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

    Route::get('/orders/statuses', [OrderController::class, 'statuses']);
    Route::post('/orders/bulk', [OrderController::class, 'bulk']);
    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'update']);
    Route::post('/orders/{order}/notes', [OrderController::class, 'addNote']);
    Route::post('/orders/{order}/transition', [OrderController::class, 'transition']);
    Route::post('/orders/{order}/resolution-request', [OrderController::class, 'requestResolution']);
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
    Route::put('/category-mappings/{categoryMapping}', [CategoryMappingController::class, 'update']);
    Route::delete('/category-mappings/{categoryMapping}', [CategoryMappingController::class, 'destroy']);
    Route::prefix('marketplaces/{marketplace}/trendyol')->group(function () {
        Route::post('/test', [TrendyolController::class, 'test']);
        Route::get('/categories', [TrendyolController::class, 'categories']);
        Route::get('/brands', [TrendyolController::class, 'brands']);
        Route::get('/categories/{categoryId}/attributes', [TrendyolController::class, 'categoryAttributes']);
        Route::get('/categories/{categoryId}/attributes/{attributeId}/values', [TrendyolController::class, 'categoryAttributeValues']);
        Route::post('/send-products', [TrendyolController::class, 'sendProducts']);
        Route::post('/update-price-inventory', [TrendyolController::class, 'updatePriceInventory']);
        Route::get('/batch-results/{batchRequestId}', [TrendyolController::class, 'batchResult']);
        Route::get('/products/filter', [TrendyolController::class, 'filterProducts']);
        Route::put('/products/archive', [TrendyolController::class, 'archiveProducts']);
        Route::post('/pull-orders', [TrendyolController::class, 'pullOrders']);
        Route::get('/orders/stream', [TrendyolController::class, 'pullOrdersStream']);
        Route::post('/webhook/packages', [TrendyolController::class, 'webhookPackages']);
        Route::get('/returns', [TrendyolController::class, 'returns']);
        Route::post('/returns/{claimId}/answer', [TrendyolController::class, 'answerReturn']);
        Route::get('/questions', [TrendyolController::class, 'questions']);
        Route::post('/questions/{questionId}/answer', [TrendyolController::class, 'answerQuestion']);
        Route::post('/shipment-packages/{packageId}/invoice-link', [TrendyolController::class, 'sendInvoiceLink']);
        Route::post('/shipment-packages/{packageId}/invoice-file', [TrendyolController::class, 'sendInvoiceFile']);
        Route::get('/common-label-barcodes', [TrendyolController::class, 'commonLabelBarcode']);
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
    Route::get('/marketplace-publish-drafts', [ProductMarketplaceController::class, 'drafts']);
    Route::post('/marketplace-publish/validate', [ProductMarketplaceController::class, 'validatePublish']);
    Route::post('/marketplace-publish-drafts/{draft}/send', [ProductMarketplaceController::class, 'send']);

    Route::get('/api-logs', [ApiLogController::class, 'index']);
    Route::get('/queue/status', [QueueDashboardController::class, 'index']);
    Route::post('/queue/failed/{uuid}/retry', [QueueDashboardController::class, 'retry']);
    Route::get('/roles', [RoleController::class, 'index']);
    Route::post('/users/{user}/roles', [RoleController::class, 'assign']);

    Route::prefix('modules/{module}')->whereIn('module', [
        'cms-pages', 'blog-categories', 'blog-posts', 'banners', 'popups', 'navigation-menus', 'faqs', 'legal-documents',
        'coupons', 'abandoned-carts', 'message-templates', 'notification-channels', 'marketing-feeds', 'tracking-pixels',
        'product-variant-options', 'product-relations', 'product-custom-fields', 'product-barcode-batches', 'product-reviews',
        'profit-rules', 'bulk-price-operations', 'price-calculations', 'order-workflow-rules', 'order-notes', 'order-operation-histories',
        'dealer-groups', 'dealers', 'dealer-prices', 'dealer-transactions', 'seo-settings', 'site-scripts', 'sitemap-entries',
        'robots-rules', 'currency-rates', 'locations', 'languages',
    ])->group(function () {
        Route::get('/', [ModuleCrudController::class, 'index']);
        Route::post('/', [ModuleCrudController::class, 'store']);
        Route::get('/{id}', [ModuleCrudController::class, 'show']);
        Route::put('/{id}', [ModuleCrudController::class, 'update']);
        Route::delete('/{id}', [ModuleCrudController::class, 'destroy']);
    });

    Route::prefix('cms/{module}')->whereIn('module', ['cms-pages', 'blog-categories', 'blog-posts', 'banners', 'popups', 'navigation-menus', 'faqs', 'legal-documents'])->group(function () {
        Route::get('/', [CmsModuleController::class, 'index']); Route::post('/', [CmsModuleController::class, 'store']); Route::get('/{id}', [CmsModuleController::class, 'show']); Route::put('/{id}', [CmsModuleController::class, 'update']); Route::delete('/{id}', [CmsModuleController::class, 'destroy']);
    });
    Route::prefix('marketing/{module}')->whereIn('module', ['coupons', 'abandoned-carts', 'message-templates', 'notification-channels', 'marketing-feeds', 'tracking-pixels'])->group(function () {
        Route::get('/', [MarketingModuleController::class, 'index']); Route::post('/', [MarketingModuleController::class, 'store']); Route::get('/{id}', [MarketingModuleController::class, 'show']); Route::put('/{id}', [MarketingModuleController::class, 'update']); Route::delete('/{id}', [MarketingModuleController::class, 'destroy']);
    });
    Route::prefix('catalog/{module}')->whereIn('module', ['product-variant-options', 'product-relations', 'product-custom-fields', 'product-barcode-batches', 'product-reviews'])->group(function () {
        Route::get('/', [CatalogModuleController::class, 'index']); Route::post('/', [CatalogModuleController::class, 'store']); Route::get('/{id}', [CatalogModuleController::class, 'show']); Route::put('/{id}', [CatalogModuleController::class, 'update']); Route::delete('/{id}', [CatalogModuleController::class, 'destroy']);
    });
    Route::prefix('pricing/{module}')->whereIn('module', ['profit-rules', 'bulk-price-operations', 'price-calculations'])->group(function () {
        Route::get('/', [PricingModuleController::class, 'index']); Route::post('/', [PricingModuleController::class, 'store']); Route::get('/{id}', [PricingModuleController::class, 'show']); Route::put('/{id}', [PricingModuleController::class, 'update']); Route::delete('/{id}', [PricingModuleController::class, 'destroy']);
    });
    Route::prefix('workflow/{module}')->whereIn('module', ['order-workflow-rules', 'order-notes', 'order-operation-histories'])->group(function () {
        Route::get('/', [WorkflowModuleController::class, 'index']); Route::post('/', [WorkflowModuleController::class, 'store']); Route::get('/{id}', [WorkflowModuleController::class, 'show']); Route::put('/{id}', [WorkflowModuleController::class, 'update']); Route::delete('/{id}', [WorkflowModuleController::class, 'destroy']);
    });
    Route::prefix('b2b/{module}')->whereIn('module', ['dealer-groups', 'dealers', 'dealer-prices', 'dealer-transactions'])->group(function () {
        Route::get('/', [B2BModuleController::class, 'index']); Route::post('/', [B2BModuleController::class, 'store']); Route::get('/{id}', [B2BModuleController::class, 'show']); Route::put('/{id}', [B2BModuleController::class, 'update']); Route::delete('/{id}', [B2BModuleController::class, 'destroy']);
    });
    Route::prefix('seo/{module}')->whereIn('module', ['seo-settings', 'site-scripts', 'sitemap-entries', 'robots-rules', 'currency-rates', 'locations', 'languages'])->group(function () {
        Route::get('/', [SeoModuleController::class, 'index']); Route::post('/', [SeoModuleController::class, 'store']); Route::get('/{id}', [SeoModuleController::class, 'show']); Route::put('/{id}', [SeoModuleController::class, 'update']); Route::delete('/{id}', [SeoModuleController::class, 'destroy']);
    });
});
