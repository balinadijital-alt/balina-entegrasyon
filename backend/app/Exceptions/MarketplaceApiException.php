<?php

namespace App\Exceptions;

use RuntimeException;

class MarketplaceApiException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $statusCode = null,
        public readonly ?array $details = null
    ) {
        parent::__construct($message, $statusCode ?? 0);
    }
}
