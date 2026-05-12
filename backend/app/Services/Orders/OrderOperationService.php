<?php

namespace App\Services\Orders;

use App\Models\Order;
use App\Models\User;
use App\Models\Workflow\OrderNote;
use App\Models\Workflow\OrderOperationHistory;
use App\Models\Workflow\OrderWorkflowRule;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class OrderOperationService
{
    public const STATUSES = [
        'new' => 'Yeni',
        'preparing' => 'Hazirlaniyor',
        'ready_to_ship' => 'Kargoya Hazir',
        'shipped' => 'Kargoda',
        'delivered' => 'Teslim Edildi',
        'cancelled' => 'Iptal',
        'returned' => 'Iade',
        'problematic' => 'Sorunlu',
    ];

    private const BUILT_IN_TRANSITIONS = [
        'new' => ['preparing', 'cancelled', 'problematic'],
        'preparing' => ['ready_to_ship', 'cancelled', 'problematic'],
        'ready_to_ship' => ['shipped', 'cancelled', 'problematic'],
        'shipped' => ['delivered', 'returned', 'problematic'],
        'delivered' => ['returned'],
        'problematic' => ['preparing', 'cancelled', 'returned'],
        'cancelled' => [],
        'returned' => [],
    ];

    public function changeStatus(Order $order, string $toStatus, ?User $user = null, array $payload = []): Order
    {
        if (! array_key_exists($toStatus, self::STATUSES)) {
            throw ValidationException::withMessages(['status' => 'Desteklenmeyen siparis durumu.']);
        }

        $fromStatus = $order->status ?: 'new';

        if ($fromStatus !== $toStatus && ! $this->canTransition($fromStatus, $toStatus)) {
            throw ValidationException::withMessages([
                'status' => "{$fromStatus} durumundan {$toStatus} durumuna gecis workflow kurallari tarafindan engellendi.",
            ]);
        }

        return DB::transaction(function () use ($order, $fromStatus, $toStatus, $user, $payload) {
            $order->update($this->statusPayload($toStatus, $payload));
            $this->recordHistory($order->fresh(), 'status_changed', $fromStatus, $toStatus, $payload, $user);

            return $order->fresh(['company', 'shipments', 'payments', 'invoices', 'notes.user', 'operationHistories.user']);
        });
    }

    public function addNote(Order $order, string $note, string $type = 'internal', ?User $user = null): OrderNote
    {
        $record = OrderNote::create([
            'order_id' => $order->id,
            'user_id' => $user?->id,
            'type' => $type,
            'note' => $note,
        ]);

        $this->recordHistory($order, 'note_added', $order->status, $order->status, ['type' => $type, 'note' => $note], $user);

        return $record->load('user:id,name,email');
    }

    public function requestResolution(Order $order, string $type, string $reason, ?User $user = null): Order
    {
        $target = match ($type) {
            'cancel' => 'cancelled',
            'return' => 'returned',
            'problem' => 'problematic',
            default => throw ValidationException::withMessages(['type' => 'Istek tipi iptal, iade veya sorunlu olmali.']),
        };

        $field = match ($type) {
            'cancel' => 'cancel_reason',
            'return' => 'return_reason',
            default => 'problem_note',
        };

        return $this->changeStatus($order, $target, $user, [
            $field => $reason,
            'request_type' => $type,
        ]);
    }

    public function recordHistory(Order $order, string $event, ?string $fromStatus = null, ?string $toStatus = null, array $payload = [], ?User $user = null): OrderOperationHistory
    {
        return OrderOperationHistory::create([
            'order_id' => $order->id,
            'user_id' => $user?->id,
            'event' => $event,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'payload' => $payload,
        ]);
    }

    private function canTransition(string $fromStatus, string $toStatus): bool
    {
        $customRuleExists = OrderWorkflowRule::query()
            ->where('from_status', $fromStatus)
            ->where('to_status', $toStatus)
            ->where('is_active', true)
            ->exists();

        return $customRuleExists || in_array($toStatus, self::BUILT_IN_TRANSITIONS[$fromStatus] ?? [], true);
    }

    private function statusPayload(string $status, array $payload): array
    {
        $data = [
            'status' => $status,
            'operation_flags' => array_filter([
                'last_operation_at' => now()->toISOString(),
                'last_request_type' => $payload['request_type'] ?? null,
            ]),
        ];

        if ($status === 'shipped') {
            $data['shipping_status'] = 'shipped';
        }

        if ($status === 'delivered') {
            $data['shipping_status'] = 'delivered';
        }

        foreach (['cancel_reason', 'return_reason', 'problem_note'] as $field) {
            if (isset($payload[$field])) {
                $data[$field] = $payload[$field];
            }
        }

        return $data;
    }
}
