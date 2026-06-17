<?php

return [
    'trendyol' => [
        'base_url' => env('TRENDYOL_BASE_URL', 'https://apigw.trendyol.com'),
        'stage_base_url' => env('TRENDYOL_STAGE_BASE_URL', 'https://stageapigw.trendyol.com'),
        'live_test_order_confirmed' => env('TRENDYOL_LIVE_TEST_ORDER_CONFIRMED', false),
        'live_return_ops_confirmed' => env('TRENDYOL_LIVE_RETURN_OPS_CONFIRMED', false),
        'live_invoice_ops_confirmed' => env('TRENDYOL_LIVE_INVOICE_OPS_CONFIRMED', false),
        'live_cargo_ops_confirmed' => env('TRENDYOL_LIVE_CARGO_OPS_CONFIRMED', false),
        'timeout' => env('TRENDYOL_TIMEOUT', 20),
        'rate_limit_attempts' => env('TRENDYOL_RATE_LIMIT_ATTEMPTS', 50),
        'rate_limit_decay' => env('TRENDYOL_RATE_LIMIT_DECAY', 10),
    ],
    'hepsiburada' => [
        'base_url' => env('HEPSIBURADA_BASE_URL', 'https://mpop.hepsiburada.com'),
        'listing_base_url' => env('HEPSIBURADA_LISTING_BASE_URL', 'https://listing-external.hepsiburada.com'),
        'order_base_url' => env('HEPSIBURADA_ORDER_BASE_URL', 'https://oms-external.hepsiburada.com'),
        'stage_base_url' => env('HEPSIBURADA_STAGE_BASE_URL'),
        'stage_listing_base_url' => env('HEPSIBURADA_STAGE_LISTING_BASE_URL'),
        'stage_order_base_url' => env('HEPSIBURADA_STAGE_ORDER_BASE_URL'),
        'timeout' => env('HEPSIBURADA_TIMEOUT', 20),
        'rate_limit_attempts' => env('HEPSIBURADA_RATE_LIMIT_ATTEMPTS', 80),
        'rate_limit_decay' => env('HEPSIBURADA_RATE_LIMIT_DECAY', 1),
    ],
];
