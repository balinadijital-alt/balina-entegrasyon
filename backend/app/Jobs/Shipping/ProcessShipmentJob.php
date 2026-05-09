<?php

namespace App\Jobs\Shipping;

use App\Models\Shipment;
use App\Services\Shipping\ShippingProviderFactory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\Middleware\WithoutOverlapping;
use Throwable;

class ProcessShipmentJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;
    public int $timeout = 180;
    public bool $failOnTimeout = true;

    public function __construct(public Shipment $shipment, public string $action = 'create', public array $payload = [])
    {
        $this->onQueue('shipping');
    }

    public function backoff(): array
    {
        return [60, 300, 900];
    }

    public function middleware(): array
    {
        return [(new WithoutOverlapping("shipment:{$this->shipment->id}:{$this->action}"))->expireAfter(600)->dontRelease()];
    }

    public function handle(ShippingProviderFactory $factory): void
    {
        $shipment = $this->shipment->fresh(['order', 'account.carrier']);
        $provider = $factory->make($shipment->account);
        $shipment->update(['status' => 'processing', 'last_action' => $this->action, 'error_message' => null]);

        $result = match ($this->action) {
            'track' => $provider->track($shipment),
            'label' => $provider->label($shipment),
            'return' => $provider->createReturnCode($shipment),
            default => $provider->createShipment($shipment->order, $shipment->account, $this->payload),
        };

        $shipment->update(array_filter($result, fn ($value) => $value !== null));
    }

    public function failed(Throwable $exception): void
    {
        $this->shipment->update([
            'status' => 'failed',
            'last_action' => $this->action,
            'error_message' => $exception->getMessage(),
        ]);
    }
}
