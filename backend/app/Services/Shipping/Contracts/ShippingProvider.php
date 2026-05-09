<?php

namespace App\Services\Shipping\Contracts;

use App\Models\Order;
use App\Models\Shipment;
use App\Models\ShippingAccount;

interface ShippingProvider
{
    public function createShipment(Order $order, ShippingAccount $account, array $payload = []): array;

    public function track(Shipment $shipment): array;

    public function label(Shipment $shipment): array;

    public function createReturnCode(Shipment $shipment): array;
}
