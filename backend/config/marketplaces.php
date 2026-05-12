<?php

return [
    'trendyol' => [
        'base_url' => env('TRENDYOL_BASE_URL', 'https://apigw.trendyol.com'),
        'stage_base_url' => env('TRENDYOL_STAGE_BASE_URL', 'https://stageapigw.trendyol.com'),
        'timeout' => env('TRENDYOL_TIMEOUT', 20),
        'rate_limit_attempts' => env('TRENDYOL_RATE_LIMIT_ATTEMPTS', 50),
        'rate_limit_decay' => env('TRENDYOL_RATE_LIMIT_DECAY', 10),
    ],
    'hepsiburada' => [
        'base_url' => env('HEPSIBURADA_BASE_URL', 'https://mpop.hepsiburada.com'),
        'listing_base_url' => env('HEPSIBURADA_LISTING_BASE_URL', 'https://listing-external.hepsiburada.com'),
        'order_base_url' => env('HEPSIBURADA_ORDER_BASE_URL', 'https://oms-external.hepsiburada.com'),
        'timeout' => env('HEPSIBURADA_TIMEOUT', 20),
        'rate_limit_attempts' => env('HEPSIBURADA_RATE_LIMIT_ATTEMPTS', 80),
        'rate_limit_decay' => env('HEPSIBURADA_RATE_LIMIT_DECAY', 1),
    ],
];
