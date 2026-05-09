<?php

use App\Http\Controllers\Api\ApiLogController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CompanyController;
use App\Http\Controllers\Api\MarketplaceSyncController;
use App\Http\Controllers\Api\MarketplaceAccountController;
use App\Http\Controllers\Api\OrderController;
use App\Http\Controllers\Api\ProductController;
use App\Http\Controllers\Api\ProductImportController;
use App\Http\Controllers\Api\ProductImageController;
use App\Http\Controllers\Api\QueueDashboardController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\TrendyolController;
use Illuminate\Support\Facades\Route;

Route::post('/auth/register', [AuthController::class, 'register']);
Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::apiResource('companies', CompanyController::class);
    Route::apiResource('products', ProductController::class);
    Route::post('/products/import', ProductImportController::class);
    Route::post('/products/{product}/images', [ProductImageController::class, 'store']);
    Route::delete('/product-images/{image}', [ProductImageController::class, 'destroy']);

    Route::apiResource('orders', OrderController::class)->only(['index', 'show', 'update']);
    Route::apiResource('marketplaces', MarketplaceAccountController::class);
    Route::prefix('marketplaces/{marketplace}/trendyol')->group(function () {
        Route::post('/test', [TrendyolController::class, 'test']);
        Route::get('/categories', [TrendyolController::class, 'categories']);
        Route::post('/send-products', [TrendyolController::class, 'sendProducts']);
        Route::post('/update-price-inventory', [TrendyolController::class, 'updatePriceInventory']);
        Route::post('/pull-orders', [TrendyolController::class, 'pullOrders']);
    });
    Route::post('/marketplaces/{marketplace}/sync-products', [MarketplaceSyncController::class, 'syncProducts']);
    Route::post('/marketplaces/{marketplace}/sync-orders', [MarketplaceSyncController::class, 'syncOrders']);

    Route::get('/api-logs', [ApiLogController::class, 'index']);
    Route::get('/queue/status', [QueueDashboardController::class, 'index']);
    Route::post('/queue/failed/{uuid}/retry', [QueueDashboardController::class, 'retry']);
    Route::get('/roles', [RoleController::class, 'index']);
    Route::post('/users/{user}/roles', [RoleController::class, 'assign']);
});
