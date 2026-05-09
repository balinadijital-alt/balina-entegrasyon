<?php

return [
    'trendyol' => [
        'base_url' => env('TRENDYOL_BASE_URL', 'https://apigw.trendyol.com'),
        'timeout' => env('TRENDYOL_TIMEOUT', 20),
        'rate_limit_attempts' => env('TRENDYOL_RATE_LIMIT_ATTEMPTS', 30),
        'rate_limit_decay' => env('TRENDYOL_RATE_LIMIT_DECAY', 60),
    ],
    'hepsiburada' => [
        'base_url' => env('HEPSIBURADA_BASE_URL', 'https://mpop.hepsiburada.com'),
    ],
];
