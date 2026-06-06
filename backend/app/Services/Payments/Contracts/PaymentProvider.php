<?php

namespace App\Services\Payments\Contracts;

use App\Models\Payment;

interface PaymentProvider
{
    public function create(Payment $payment, array $payload = []): array;

    public function startThreeDSecure(Payment $payment, array $payload = []): array;

    public function verifyCallback(Payment $payment, array $payload, ?string $signature = null, ?string $rawBody = null): bool;

    public function query(Payment $payment): array;

    public function refund(Payment $payment, float $amount, array $payload = []): array;
}
