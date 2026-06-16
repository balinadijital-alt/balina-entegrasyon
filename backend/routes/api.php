<?php

use App\Http\Controllers\Api\ApiLogController;
use App\Http\Controllers\Api\AccountingAccountController;
use App\Http\Controllers\Api\AccountingIntegrationController;
use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\B2BModuleController;
use App\Http\Controllers\Api\CategoryMappingController;
use App\Http\Controllers\Api\CatalogResourceController;
use App\Http\Controllers\Api\CatalogModuleController;
use App\Http\Controllers\Api\CmsModuleController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\CompanySettingsController;
use App\Http\Controllers\Api\CurrentAccountController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\HepsiburadaController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InboundWebhookDeliveryController;
use App\Http\Controllers\Api\InvoiceController;
use App\Http\Controllers\Api\MarketplaceSyncController;
use App\Http\Controllers\Api\MarketplaceAccountController;
use App\Http\Controllers\Api\MarketplaceCatalogController;
use App\Http\Controllers\Api\MarketplaceMappingController;
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
use App\Http\Controllers\Api\Public\TrendyolWebhookController;
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
Route::post('/payment-callbacks/{payment}', [PaymentController::class, 'callback'])->middleware('throttle:30,1');
Route::post('/webhooks/trendyol/packages', [TrendyolWebhookController::class, 'packages'])->middleware('throttle:30,1');
Route::get('/health', HealthController::class);
Route::get('/health/live', [HealthController::class, 'live']);
Route::get('/health/ready', [HealthController::class, 'ready']);

Route::middleware(['auth:sanctum', 'throttle:api', 'tenant.company'])->group(function () {
    Route::get('/dashboard', DashboardController::class);
    Route::get('/analytics/overview', [AnalyticsController::class, 'overview'])->middleware('permission:analytics.view');
    Route::get('/analytics/executive', [AnalyticsController::class, 'executive'])->middleware('permission:executive.view');
    Route::get('/analytics/marketplaces/{marketplace}/drilldown', [AnalyticsController::class, 'marketplaceDrilldown'])->middleware('permission:analytics.view');
    Route::get('/settings', [CompanySettingsController::class, 'show']);
    Route::put('/settings', [CompanySettingsController::class, 'update'])->middleware('permission:settings.manage');
    Route::post('/settings/webhook-test', [CompanySettingsController::class, 'testWebhook'])->middleware('permission:settings.manage');
    Route::get('/settings/webhook-deliveries', [CompanySettingsController::class, 'webhookDeliveries']);

    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/saas/plans', [SaasController::class, 'plans']);
    Route::get('/saas/subscriptions', [SaasController::class, 'subscriptions']);
    Route::get('/companies/{company}/saas-usage', [SaasController::class, 'usage']);
    Route::post('/companies/{company}/change-plan', [SaasController::class, 'changePlan'])->middleware('permission:saas.manage');
    Route::post('/companies/{company}/start-trial', [SaasController::class, 'startTrial'])->middleware('permission:saas.manage');
    Route::get('/licenses', [SaasController::class, 'licenses'])->middleware('permission:saas.manage');
    Route::post('/licenses', [SaasController::class, 'createLicense'])->middleware('permission:saas.manage');
    Route::post('/licenses/activate', [SaasController::class, 'activateLicense'])->middleware('permission:saas.manage');
    Route::get('/partners', [SaasController::class, 'partners'])->middleware('permission:saas.manage');
    Route::post('/partners', [SaasController::class, 'createPartner'])->middleware('permission:saas.manage');

    Route::apiResource('companies', CompanyController::class)->middleware('permission:companies.manage');
    Route::apiResource('products', ProductController::class)->middleware('plan.limit:products');
    Route::apiResource('catalog-resources', CatalogResourceController::class)
        ->parameters(['catalog-resources' => 'catalogResource'])
        ->except(['show']);
    Route::get('/products/{product}/readiness', [ProductMarketplaceController::class, 'readiness']);
    Route::post('/products/import', ProductImportController::class)->middleware(['plan.limit:products', 'permission:imports.manage']);
    Route::post('/products/{product}/images', [ProductImageController::class, 'store'])->middleware('permission:products.manage');
    Route::delete('/product-images/{image}', [ProductImageController::class, 'destroy'])->middleware('permission:products.manage');
    Route::apiResource('xml-sources', XmlSourceController::class)
        ->parameters(['xml-sources' => 'xmlSource'])
        ->except(['show'])
        ->middleware(['plan.limit:xml_sources', 'permission:imports.manage']);
    Route::post('/xml-sources/{xmlSource}/preview', [XmlSourceController::class, 'preview']);
    Route::post('/xml-sources/{xmlSource}/import', [XmlSourceController::class, 'import'])->middleware('permission:imports.manage');
    Route::get('/import-runs', [ProductImportRunController::class, 'index']);
    Route::get('/import-runs/{importRun}', [ProductImportRunController::class, 'show']);
    Route::post('/import-runs/preview-excel', [ProductImportRunController::class, 'previewExcel'])->middleware('permission:imports.manage');
    Route::post('/import-runs/excel', [ProductImportRunController::class, 'queueExcel'])->middleware('permission:imports.manage');
    Route::post('/import-runs/{importRun}/retry', [ProductImportRunController::class, 'retry'])->middleware('permission:imports.manage');

    Route::get('/orders/statuses', [OrderController::class, 'statuses']);
    Route::post('/orders/bulk', [OrderController::class, 'bulk'])->middleware('permission:orders.manage');
    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'update'])->middleware('permission:orders.manage');
    Route::post('/orders/{order}/notes', [OrderController::class, 'addNote'])->middleware('permission:orders.manage');
    Route::post('/orders/{order}/transition', [OrderController::class, 'transition'])->middleware('permission:orders.manage');
    Route::post('/orders/{order}/resolution-request', [OrderController::class, 'requestResolution'])->middleware('permission:orders.manage');
    Route::get('/accounting-integrations', [AccountingIntegrationController::class, 'index']);
    Route::apiResource('accounting-accounts', AccountingAccountController::class)->parameters(['accounting-accounts' => 'accountingAccount'])->except(['show', 'destroy'])->middleware('permission:accounting.manage');
    Route::get('/current-accounts', [CurrentAccountController::class, 'index'])->middleware('permission:accounting.manage');
    Route::post('/current-accounts', [CurrentAccountController::class, 'store'])->middleware('permission:accounting.manage');
    Route::get('/current-transactions', [CurrentAccountController::class, 'transactions'])->middleware('permission:accounting.manage');
    Route::post('/current-accounts/{currentAccount}/transactions', [CurrentAccountController::class, 'addTransaction'])->middleware('permission:accounting.manage');
    Route::get('/invoices', [InvoiceController::class, 'index'])->middleware('permission:accounting.manage');
    Route::get('/accounting-logs', [InvoiceController::class, 'logs'])->middleware('permission:accounting.manage');
    Route::post('/orders/{order}/invoices', [InvoiceController::class, 'createForOrder'])->middleware('permission:accounting.manage');
    Route::post('/invoices/{invoice}/return', [InvoiceController::class, 'returnInvoice'])->middleware('permission:accounting.manage');
    Route::post('/invoices/{invoice}/query', [InvoiceController::class, 'query'])->middleware('permission:accounting.manage');
    Route::post('/invoices/{invoice}/pdf', [InvoiceController::class, 'pdf'])->middleware('permission:accounting.manage');
    Route::get('/invoices/{invoice}/pdf', [InvoiceController::class, 'download'])->middleware('permission:accounting.manage');
    Route::get('/payment-providers', [PaymentProviderController::class, 'index']);
    Route::apiResource('payment-accounts', PaymentAccountController::class)
        ->parameters(['payment-accounts' => 'paymentAccount'])
        ->except(['show'])
        ->middleware('permission:payments.manage');
    Route::get('/payments', [PaymentController::class, 'index'])->middleware('permission:payments.manage');
    Route::get('/payment-logs', [PaymentController::class, 'logs'])->middleware('permission:payments.manage');
    Route::post('/orders/{order}/payments', [PaymentController::class, 'createForOrder'])->middleware('permission:payments.manage');
    Route::post('/payments/{payment}/query', [PaymentController::class, 'query'])->middleware('permission:payments.manage');
    Route::post('/payments/{payment}/refund', [PaymentController::class, 'refund'])->middleware('permission:payments.refund');
    Route::get('/shipping-carriers', [ShippingCarrierController::class, 'index']);
    Route::apiResource('shipping-accounts', ShippingAccountController::class)
        ->parameters(['shipping-accounts' => 'shippingAccount'])
        ->except(['show'])
        ->middleware('permission:shipping.manage');
    Route::get('/shipments', [ShipmentController::class, 'index'])->middleware('permission:shipping.manage');
    Route::post('/orders/{order}/shipments', [ShipmentController::class, 'createForOrder'])->middleware('permission:shipping.manage');
    Route::post('/shipments/bulk-labels', [ShipmentController::class, 'bulkLabels'])->middleware('permission:shipping.labels');
    Route::post('/shipments/{shipment}/track', [ShipmentController::class, 'track'])->middleware('permission:shipping.manage');
    Route::post('/shipments/{shipment}/label', [ShipmentController::class, 'label'])->middleware('permission:shipping.labels');
    Route::get('/shipments/{shipment}/label', [ShipmentController::class, 'downloadLabel'])->middleware('permission:shipping.labels');
    Route::post('/shipments/{shipment}/return-code', [ShipmentController::class, 'returnCode'])->middleware('permission:shipping.manage');
    Route::post('/shipments/{shipment}/retry', [ShipmentController::class, 'retry'])->middleware('permission:shipping.manage');
    Route::apiResource('marketplaces', MarketplaceAccountController::class)->middleware(['plan.limit:marketplaces', 'permission:marketplaces.manage']);
    Route::prefix('marketplace-catalog/{marketplace}')->group(function () {
        Route::get('/categories', [MarketplaceCatalogController::class, 'categories']);
        Route::post('/categories/sync', [MarketplaceCatalogController::class, 'syncCategories']);
        Route::get('/brands', [MarketplaceCatalogController::class, 'brands']);
        Route::post('/brands/sync', [MarketplaceCatalogController::class, 'syncBrands']);
        Route::get('/categories/{categoryId}/attributes', [MarketplaceCatalogController::class, 'attributes']);
        Route::post('/categories/{categoryId}/attributes/sync', [MarketplaceCatalogController::class, 'syncAttributes']);
        Route::post('/mapped-categories/attributes/sync', [MarketplaceCatalogController::class, 'syncMappedAttributes']);
        Route::get('/categories/{categoryId}/attributes/{attributeId}/values', [MarketplaceCatalogController::class, 'attributeValues']);
        Route::post('/categories/{categoryId}/attributes/{attributeId}/values/sync', [MarketplaceCatalogController::class, 'syncAttributeValues']);
    });
    Route::prefix('marketplace-mappings')->middleware('permission:marketplaces.manage')->group(function () {
        Route::get('/summary', [MarketplaceMappingController::class, 'summary']);
        Route::get('/readiness-preview', [MarketplaceMappingController::class, 'readinessPreview']);

        Route::get('/categories', [MarketplaceMappingController::class, 'categories']);
        Route::post('/categories', [MarketplaceMappingController::class, 'storeCategory']);
        Route::put('/categories/{mapping}', [MarketplaceMappingController::class, 'updateCategory']);
        Route::delete('/categories/{mapping}', [MarketplaceMappingController::class, 'destroyCategory']);

        Route::get('/brands', [MarketplaceMappingController::class, 'brands']);
        Route::post('/brands', [MarketplaceMappingController::class, 'storeBrand']);
        Route::put('/brands/{mapping}', [MarketplaceMappingController::class, 'updateBrand']);
        Route::delete('/brands/{mapping}', [MarketplaceMappingController::class, 'destroyBrand']);

        Route::get('/attributes', [MarketplaceMappingController::class, 'attributes']);
        Route::post('/attributes', [MarketplaceMappingController::class, 'storeAttribute']);
        Route::put('/attributes/{mapping}', [MarketplaceMappingController::class, 'updateAttribute']);
        Route::delete('/attributes/{mapping}', [MarketplaceMappingController::class, 'destroyAttribute']);

        Route::get('/variants', [MarketplaceMappingController::class, 'variants']);
        Route::post('/variants', [MarketplaceMappingController::class, 'storeVariant']);
        Route::put('/variants/{mapping}', [MarketplaceMappingController::class, 'updateVariant']);
        Route::delete('/variants/{mapping}', [MarketplaceMappingController::class, 'destroyVariant']);
    });
    Route::get('/category-mappings', [CategoryMappingController::class, 'index']);
    Route::post('/category-mappings', [CategoryMappingController::class, 'store']);
    Route::put('/category-mappings/{categoryMapping}', [CategoryMappingController::class, 'update']);
    Route::delete('/category-mappings/{categoryMapping}', [CategoryMappingController::class, 'destroy']);
    Route::prefix('marketplaces/{marketplace}/trendyol')->group(function () {
        Route::post('/test', [TrendyolController::class, 'test'])->middleware('permission:marketplaces.manage');
        Route::get('/categories', [TrendyolController::class, 'categories']);
        Route::get('/brands', [TrendyolController::class, 'brands']);
        Route::get('/categories/{categoryId}/attributes', [TrendyolController::class, 'categoryAttributes']);
        Route::get('/categories/{categoryId}/attributes/{attributeId}/values', [TrendyolController::class, 'categoryAttributeValues']);
        Route::post('/send-products', [TrendyolController::class, 'sendProducts'])->middleware('permission:marketplaces.send');
        Route::post('/update-price-inventory', [TrendyolController::class, 'updatePriceInventory'])->middleware('permission:marketplaces.send');
        Route::get('/batch-results/{batchRequestId}', [TrendyolController::class, 'batchResult']);
        Route::get('/products/filter', [TrendyolController::class, 'filterProducts']);
        Route::put('/products/archive', [TrendyolController::class, 'archiveProducts'])->middleware('permission:marketplaces.send');
        Route::post('/pull-orders', [TrendyolController::class, 'pullOrders'])->middleware('permission:marketplaces.send');
        Route::get('/orders/stream', [TrendyolController::class, 'pullOrdersStream']);
        Route::post('/test-orders', [TrendyolController::class, 'createTestOrder'])->middleware('permission:marketplaces.manage');
        Route::post('/test-orders/{packageId}/status', [TrendyolController::class, 'updateTestOrderStatus'])->middleware('permission:marketplaces.manage');
        Route::post('/orders/{order}/package-status', [TrendyolController::class, 'updatePackageStatus'])->middleware('permission:marketplaces.send');
        Route::post('/orders/{order}/cancel-item', [TrendyolController::class, 'cancelPackageItem'])->middleware('permission:marketplaces.send');
        Route::post('/webhook/packages', [TrendyolController::class, 'webhookPackages'])->middleware('permission:marketplaces.send');
        Route::get('/returns/claims', [TrendyolController::class, 'returnClaims']);
        Route::post('/returns/claims/sync', [TrendyolController::class, 'syncReturnClaims'])->middleware('permission:marketplaces.send');
        Route::get('/returns/issue-reasons', [TrendyolController::class, 'returnIssueReasons']);
        Route::post('/returns/{claimId}/issue', [TrendyolController::class, 'createReturnIssue'])->middleware('permission:marketplaces.send');
        Route::post('/returns/{claimId}/approve', [TrendyolController::class, 'approveReturnClaim'])->middleware('permission:marketplaces.send');
        Route::get('/returns/{claimId}/audits', [TrendyolController::class, 'returnClaimAudits']);
        Route::get('/returns', [TrendyolController::class, 'returns']);
        Route::post('/returns/{claimId}/answer', [TrendyolController::class, 'answerReturn'])->middleware('permission:marketplaces.send');
        Route::get('/questions', [TrendyolController::class, 'questions']);
        Route::post('/questions/{questionId}/answer', [TrendyolController::class, 'answerQuestion'])->middleware('permission:marketplaces.send');
        Route::post('/shipment-packages/{packageId}/invoice-link', [TrendyolController::class, 'sendInvoiceLink'])->middleware('permission:marketplaces.send');
        Route::post('/shipment-packages/{packageId}/invoice-file', [TrendyolController::class, 'sendInvoiceFile'])->middleware('permission:marketplaces.send');
        Route::get('/common-label-barcodes', [TrendyolController::class, 'commonLabelBarcode']);
    });
    Route::prefix('marketplaces/{marketplace}/hepsiburada')->group(function () {
        Route::post('/test', [HepsiburadaController::class, 'test'])->middleware('permission:marketplaces.manage');
        Route::get('/categories', [HepsiburadaController::class, 'categories']);
        Route::post('/send-products', [HepsiburadaController::class, 'sendProducts'])->middleware('permission:marketplaces.send');
        Route::post('/update-price-inventory', [HepsiburadaController::class, 'updatePriceInventory'])->middleware('permission:marketplaces.send');
        Route::post('/pull-orders', [HepsiburadaController::class, 'pullOrders'])->middleware('permission:marketplaces.send');
    });
    Route::post('/marketplaces/{marketplace}/sync-products', [MarketplaceSyncController::class, 'syncProducts'])->middleware('permission:marketplaces.send');
    Route::post('/marketplaces/{marketplace}/sync-orders', [MarketplaceSyncController::class, 'syncOrders'])->middleware('permission:marketplaces.send');
    Route::get('/marketplace-publish-drafts', [ProductMarketplaceController::class, 'drafts']);
    Route::post('/marketplace-publish/validate', [ProductMarketplaceController::class, 'validatePublish']);
    Route::post('/marketplace-publish-drafts/{draft}/send', [ProductMarketplaceController::class, 'send'])->middleware('permission:marketplaces.send');
    Route::post('/marketplace-publish-drafts/{draft}/batch-result', [ProductMarketplaceController::class, 'batchResult'])->middleware('permission:marketplaces.send');

    Route::get('/api-logs', [ApiLogController::class, 'index'])->middleware('permission:logs.view');
    Route::get('/inbound-webhook-deliveries', [InboundWebhookDeliveryController::class, 'index'])->middleware('permission:logs.view');
    Route::get('/queue/status', [QueueDashboardController::class, 'index'])->middleware('permission:queue.view');
    Route::post('/queue/failed/{uuid}/retry', [QueueDashboardController::class, 'retry'])->middleware('permission:queue.retry');
    Route::get('/roles', [RoleController::class, 'index'])->middleware('permission:roles.manage');
    Route::post('/users/{user}/roles', [RoleController::class, 'assign'])->middleware('permission:roles.manage');

    Route::prefix('modules/{module}')->whereIn('module', [
        'cms-pages', 'blog-categories', 'blog-posts', 'banners', 'popups', 'navigation-menus', 'faqs', 'legal-documents',
        'coupons', 'abandoned-carts', 'message-templates', 'notification-channels', 'marketing-feeds', 'tracking-pixels',
        'product-variant-options', 'product-relations', 'product-custom-fields', 'product-barcode-batches', 'product-reviews',
        'profit-rules', 'bulk-price-operations', 'price-calculations', 'order-workflow-rules', 'order-notes', 'order-operation-histories',
        'dealer-groups', 'dealers', 'dealer-prices', 'dealer-transactions', 'seo-settings', 'site-scripts', 'sitemap-entries',
        'robots-rules', 'currency-rates', 'locations', 'languages',
    ])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [ModuleCrudController::class, 'index']);
        Route::post('/', [ModuleCrudController::class, 'store']);
        Route::get('/{id}', [ModuleCrudController::class, 'show']);
        Route::put('/{id}', [ModuleCrudController::class, 'update']);
        Route::delete('/{id}', [ModuleCrudController::class, 'destroy']);
    });

    Route::prefix('cms/{module}')->whereIn('module', ['cms-pages', 'blog-categories', 'blog-posts', 'banners', 'popups', 'navigation-menus', 'faqs', 'legal-documents'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [CmsModuleController::class, 'index']); Route::post('/', [CmsModuleController::class, 'store']); Route::get('/{id}', [CmsModuleController::class, 'show']); Route::put('/{id}', [CmsModuleController::class, 'update']); Route::delete('/{id}', [CmsModuleController::class, 'destroy']);
    });
    Route::prefix('marketing/{module}')->whereIn('module', ['coupons', 'abandoned-carts', 'message-templates', 'notification-channels', 'marketing-feeds', 'tracking-pixels'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [MarketingModuleController::class, 'index']); Route::post('/', [MarketingModuleController::class, 'store']); Route::get('/{id}', [MarketingModuleController::class, 'show']); Route::put('/{id}', [MarketingModuleController::class, 'update']); Route::delete('/{id}', [MarketingModuleController::class, 'destroy']);
    });
    Route::prefix('catalog/{module}')->whereIn('module', ['product-variant-options', 'product-relations', 'product-custom-fields', 'product-barcode-batches', 'product-reviews'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [CatalogModuleController::class, 'index']); Route::post('/', [CatalogModuleController::class, 'store']); Route::get('/{id}', [CatalogModuleController::class, 'show']); Route::put('/{id}', [CatalogModuleController::class, 'update']); Route::delete('/{id}', [CatalogModuleController::class, 'destroy']);
    });
    Route::prefix('pricing/{module}')->whereIn('module', ['profit-rules', 'bulk-price-operations', 'price-calculations'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [PricingModuleController::class, 'index']); Route::post('/', [PricingModuleController::class, 'store']); Route::get('/{id}', [PricingModuleController::class, 'show']); Route::put('/{id}', [PricingModuleController::class, 'update']); Route::delete('/{id}', [PricingModuleController::class, 'destroy']);
    });
    Route::prefix('workflow/{module}')->whereIn('module', ['order-workflow-rules', 'order-notes', 'order-operation-histories'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [WorkflowModuleController::class, 'index']); Route::post('/', [WorkflowModuleController::class, 'store']); Route::get('/{id}', [WorkflowModuleController::class, 'show']); Route::put('/{id}', [WorkflowModuleController::class, 'update']); Route::delete('/{id}', [WorkflowModuleController::class, 'destroy']);
    });
    Route::prefix('b2b/{module}')->whereIn('module', ['dealer-groups', 'dealers', 'dealer-prices', 'dealer-transactions'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [B2BModuleController::class, 'index']); Route::post('/', [B2BModuleController::class, 'store']); Route::get('/{id}', [B2BModuleController::class, 'show']); Route::put('/{id}', [B2BModuleController::class, 'update']); Route::delete('/{id}', [B2BModuleController::class, 'destroy']);
    });
    Route::prefix('seo/{module}')->whereIn('module', ['seo-settings', 'site-scripts', 'sitemap-entries', 'robots-rules', 'currency-rates', 'locations', 'languages'])->middleware('permission:modules.manage')->group(function () {
        Route::get('/', [SeoModuleController::class, 'index']); Route::post('/', [SeoModuleController::class, 'store']); Route::get('/{id}', [SeoModuleController::class, 'show']); Route::put('/{id}', [SeoModuleController::class, 'update']); Route::delete('/{id}', [SeoModuleController::class, 'destroy']);
    });
});
