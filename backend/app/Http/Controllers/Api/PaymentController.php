<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Middleware\RequestCorrelationMiddleware;
use App\Jobs\Payments\CheckPaymentStatusJob;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Services\Audit\AuditLogger;
use App\Services\Payments\PaymentProviderFactory;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    private const CALLBACK_TIMESTAMP_TOLERANCE_SECONDS = 300;
    private const CALLBACK_STATUSES = ['paid', 'failed', 'pending', 'cancelled', 'refunded'];
    private const SENSITIVE_KEYS = ['secret', 'token', 'password', 'api_key', 'api_secret', 'authorization', 'webhook_secret', 'key', 'three_d_html'];

    public function index(Request $request): JsonResponse
    {
        return response()->json(Payment::with(['order:id,marketplace_order_id,customer_name', 'account.provider:id,code,name'])
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->whereHas('order', fn ($order) => $order->where('company_id', $companyId)))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->latest()
            ->paginate(30));
    }

    public function logs(Request $request): JsonResponse
    {
        return response()->json(PaymentLog::query()
            ->when($this->tenantCompanyId($request), fn ($query, $companyId) => $query->whereHas('payment.order', fn ($order) => $order->where('company_id', $companyId)))
            ->when($request->filled('payment_id'), fn ($query) => $query->where('payment_id', $request->integer('payment_id')))
            ->latest()
            ->paginate(50));
    }

    public function createForOrder(Order $order, Request $request, PaymentProviderFactory $factory, AuditLogger $audit): JsonResponse
    {
        $this->abortIfOrderNotTenant($request, $order);

        $data = $request->validate([
            'payment_account_id' => ['required', 'exists:payment_accounts,id'],
            'method' => ['nullable', 'in:card,three_d,bank_transfer,cash_on_delivery'],
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'installment_count' => ['nullable', 'integer', 'min:1', 'max:12'],
            'payload' => ['nullable', 'array'],
        ]);

        $account = PaymentAccount::with('provider')->findOrFail($data['payment_account_id']);
        if ((int) $account->company_id !== (int) $order->company_id) {
            abort(403, 'Odeme hesabi bu firmaya ait degil.');
        }

        $installment = (int) ($data['installment_count'] ?? 1);
        $amount = (float) ($data['amount'] ?? $order->total_amount);
        $commissionRate = (float) data_get($account->commission_rates, (string) $installment, 0);
        $payment = Payment::create([
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'provider_code' => $account->provider->code,
            'method' => $data['method'] ?? 'card',
            'status' => 'pending',
            'amount' => $amount,
            'installment_count' => $installment,
            'commission_rate' => $commissionRate,
            'commission_amount' => round($amount * $commissionRate / 100, 2),
            'conversation_id' => (string) Str::uuid(),
            'request_payload' => $data['payload'] ?? [],
        ]);

        $provider = $factory->make($account);
        $result = $payment->method === 'three_d'
            ? $provider->startThreeDSecure($payment->fresh(['order', 'account.provider']), $data['payload'] ?? [])
            : $provider->create($payment->fresh(['order', 'account.provider']), $data['payload'] ?? []);
        $payment->update(array_filter($result, fn ($value) => $value !== null));
        CheckPaymentStatusJob::dispatch($payment)->delay(now()->addMinutes(2));
        $audit->logAction($request, 'payment', 'payment.create', $payment, [
            'company_id' => $order->company_id,
            'order_id' => $order->id,
            'payment_account_id' => $account->id,
            'provider_code' => $account->provider->code,
            'queued' => true,
        ], null, ['amount' => $amount, 'method' => $payment->method, 'payload' => $data['payload'] ?? []]);

        return response()->json($payment->fresh(), 201);
    }

    public function query(Payment $payment, AuditLogger $audit): JsonResponse
    {
        $this->abortIfPaymentNotTenant(request(), $payment);

        CheckPaymentStatusJob::dispatch($payment);
        $audit->logAction(request(), 'payment', 'payment.query', $payment, [
            'company_id' => $payment->order?->company_id,
            'payment_id' => $payment->id,
            'provider_code' => $payment->provider_code,
            'queued' => true,
        ]);

        return response()->json(['message' => 'Odeme durum sorgusu kuyruga alindi.', 'queued' => true], 202);
    }

    public function refund(Payment $payment, Request $request, PaymentProviderFactory $factory, AuditLogger $audit): JsonResponse
    {
        $this->abortIfPaymentNotTenant($request, $payment);

        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'payload' => ['nullable', 'array'],
        ]);

        $old = $payment->fresh(['order'])->toArray();
        $oldRefundedAmount = (float) $payment->refunded_amount;
        $amount = (float) ($data['amount'] ?? ((float) $payment->amount - $oldRefundedAmount));
        $result = $factory->make($payment->account()->with('provider')->firstOrFail())->refund($payment->fresh(['account.provider']), $amount, $data['payload'] ?? []);
        $payment->update(array_filter($result, fn ($value) => $value !== null));
        $fresh = $payment->fresh(['order']);
        $audit->logAction($request, 'payment', 'payment.refund', $payment, [
            'company_id' => $fresh->order?->company_id,
            'payment_id' => $payment->id,
            'provider_code' => $payment->provider_code,
            'amount' => $amount,
            'old_refunded_amount' => $oldRefundedAmount,
            'new_refunded_amount' => (float) $fresh->refunded_amount,
        ], $old, ['status' => $fresh->status, 'refunded_amount' => $fresh->refunded_amount, 'payload' => $data['payload'] ?? []]);

        return response()->json($fresh);
    }

    public function callback(Payment $payment, Request $request, PaymentProviderFactory $factory): JsonResponse
    {
        $payload = $request->all();
        $rawBody = $request->getContent();
        $signature = $request->header('X-Signature') ?: $request->input('signature');
        $providerTimestamp = $this->providerTimestamp($request);
        $idempotencyKey = $this->callbackIdempotencyKey($request, $payment, $payload, $rawBody);
        $provider = $factory->make($payment->account()->with('provider')->firstOrFail());

        if (! $providerTimestamp || ! $this->timestampWithinWindow($providerTimestamp)) {
            $this->callbackLog($request, $payment, 'rejected', $payload, 'Callback timestamp gecersiz.', $idempotencyKey, false, $providerTimestamp);

            return response()->json(['message' => 'Callback timestamp gecersiz.'], 403);
        }

        if (! $provider->verifyCallback($payment->fresh(['account.provider']), $payload, $signature, $rawBody)) {
            $this->callbackLog($request, $payment, 'rejected', $payload, 'Callback imzasi dogrulanamadi.', $idempotencyKey, false, $providerTimestamp);

            return response()->json(['message' => 'Callback imzasi gecersiz.'], 403);
        }

        $status = $payload['status'] ?? $payload['payment_status'] ?? 'paid';
        if (! in_array($status, self::CALLBACK_STATUSES, true)) {
            $this->callbackLog($request, $payment, 'rejected', $payload, 'Callback status gecersiz.', $idempotencyKey, true, $providerTimestamp);

            return response()->json(['message' => 'Callback status gecersiz.'], 422);
        }

        $existing = PaymentLog::query()
            ->where('payment_id', $payment->id)
            ->where('event', 'callback')
            ->where('idempotency_key', $idempotencyKey)
            ->where('signature_valid', true)
            ->where('status', '!=', 'rejected')
            ->first();

        if ($existing) {
            return response()->json(['message' => 'Callback daha once islendi.', 'duplicate' => true]);
        }

        $payment->update([
            'status' => $status,
            'transaction_id' => $payload['transaction_id'] ?? $payment->transaction_id,
            'response_payload' => $this->maskPayload($payload),
            'paid_at' => $status === 'paid' ? now() : $payment->paid_at,
            'failed_at' => $status === 'failed' ? now() : $payment->failed_at,
        ]);

        $this->callbackLog($request, $payment, $status, $payload, null, $idempotencyKey, true, $providerTimestamp, ['accepted' => true]);

        return response()->json(['message' => 'Callback islendi.']);
    }

    private function callbackLog(
        Request $request,
        Payment $payment,
        string $status,
        array $payload,
        ?string $error,
        string $idempotencyKey,
        ?bool $signatureValid,
        ?CarbonImmutable $providerTimestamp,
        ?array $response = null,
    ): void {
        PaymentLog::create([
            'payment_id' => $payment->id,
            'payment_account_id' => $payment->payment_account_id,
            'provider_code' => $payment->provider_code,
            'event' => 'callback',
            'status' => $status,
            'request_payload' => $this->maskPayload($payload),
            'response_payload' => $response,
            'error_message' => $error,
            'request_id' => $request->attributes->get(RequestCorrelationMiddleware::REQUEST_ID_ATTRIBUTE),
            'correlation_id' => $request->attributes->get(RequestCorrelationMiddleware::CORRELATION_ID_ATTRIBUTE),
            'idempotency_key' => $idempotencyKey,
            'signature_valid' => $signatureValid,
            'provider_timestamp' => $providerTimestamp,
        ]);
    }

    private function providerTimestamp(Request $request): ?CarbonImmutable
    {
        $value = $request->header('X-Timestamp')
            ?: $request->header('X-Balina-Timestamp')
            ?: $request->header('X-Provider-Timestamp')
            ?: $request->input('timestamp');

        if (! $value) {
            return null;
        }

        try {
            return is_numeric($value)
                ? CarbonImmutable::createFromTimestamp((int) $value)
                : CarbonImmutable::parse($value);
        } catch (\Throwable) {
            return null;
        }
    }

    private function timestampWithinWindow(CarbonImmutable $timestamp): bool
    {
        $now = CarbonImmutable::now();

        return $timestamp->greaterThanOrEqualTo($now->subSeconds(self::CALLBACK_TIMESTAMP_TOLERANCE_SECONDS))
            && $timestamp->lessThanOrEqualTo($now->addSeconds(self::CALLBACK_TIMESTAMP_TOLERANCE_SECONDS));
    }

    private function callbackIdempotencyKey(Request $request, Payment $payment, array $payload, string $rawBody): string
    {
        $providerKey = $request->header('X-Idempotency-Key')
            ?: $request->header('X-Callback-Id')
            ?: data_get($payload, 'idempotency_key')
            ?: data_get($payload, 'callback_id')
            ?: implode('|', array_filter([
                data_get($payload, 'transaction_id'),
                data_get($payload, 'status', data_get($payload, 'payment_status')),
            ]));

        if (! $providerKey) {
            $providerKey = hash('sha256', $rawBody);
        }

        return hash('sha256', implode('|', [
            'payment',
            $payment->id,
            $payment->provider_code,
            $providerKey,
        ]));
    }

    private function maskPayload(mixed $value): mixed
    {
        if (is_array($value)) {
            return collect($value)
                ->mapWithKeys(fn ($item, $key) => [
                    $key => $this->isSensitive((string) $key) ? '******' : $this->maskPayload($item),
                ])
                ->all();
        }

        return $value;
    }

    private function isSensitive(string $key): bool
    {
        return Arr::first(self::SENSITIVE_KEYS, fn (string $needle) => str_contains(strtolower($key), $needle)) !== null;
    }
}
