<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\Payments\CheckPaymentStatusJob;
use App\Models\Order;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PaymentLog;
use App\Services\Payments\PaymentProviderFactory;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(Payment::with(['order:id,marketplace_order_id,customer_name', 'account.provider:id,code,name'])
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->latest()
            ->paginate(30));
    }

    public function logs(Request $request): JsonResponse
    {
        return response()->json(PaymentLog::query()
            ->when($request->filled('payment_id'), fn ($query) => $query->where('payment_id', $request->integer('payment_id')))
            ->latest()
            ->paginate(50));
    }

    public function createForOrder(Order $order, Request $request, PaymentProviderFactory $factory): JsonResponse
    {
        $data = $request->validate([
            'payment_account_id' => ['required', 'exists:payment_accounts,id'],
            'method' => ['nullable', 'in:card,three_d,bank_transfer,cash_on_delivery'],
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'installment_count' => ['nullable', 'integer', 'min:1', 'max:12'],
            'payload' => ['nullable', 'array'],
        ]);

        $account = PaymentAccount::with('provider')->findOrFail($data['payment_account_id']);
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

        return response()->json($payment->fresh(), 201);
    }

    public function query(Payment $payment): JsonResponse
    {
        CheckPaymentStatusJob::dispatch($payment);

        return response()->json(['message' => 'Odeme durum sorgusu kuyruga alindi.', 'queued' => true], 202);
    }

    public function refund(Payment $payment, Request $request, PaymentProviderFactory $factory): JsonResponse
    {
        $data = $request->validate([
            'amount' => ['nullable', 'numeric', 'min:0.01'],
            'payload' => ['nullable', 'array'],
        ]);

        $amount = (float) ($data['amount'] ?? ((float) $payment->amount - (float) $payment->refunded_amount));
        $result = $factory->make($payment->account()->with('provider')->firstOrFail())->refund($payment->fresh(['account.provider']), $amount, $data['payload'] ?? []);
        $payment->update(array_filter($result, fn ($value) => $value !== null));

        return response()->json($payment->fresh());
    }

    public function callback(Payment $payment, Request $request, PaymentProviderFactory $factory): JsonResponse
    {
        $payload = $request->all();
        $signature = $request->header('X-Signature') ?: $request->input('signature');
        $provider = $factory->make($payment->account()->with('provider')->firstOrFail());

        if (! $provider->verifyCallback($payment->fresh(['account.provider']), $payload, $signature)) {
            PaymentLog::create([
                'payment_id' => $payment->id,
                'payment_account_id' => $payment->payment_account_id,
                'provider_code' => $payment->provider_code,
                'event' => 'callback',
                'status' => 'rejected',
                'request_payload' => $payload,
                'error_message' => 'Callback imzasi dogrulanamadi.',
            ]);

            return response()->json(['message' => 'Callback imzasi gecersiz.'], 403);
        }

        $status = $payload['status'] ?? $payload['payment_status'] ?? 'paid';
        $payment->update([
            'status' => $status,
            'transaction_id' => $payload['transaction_id'] ?? $payment->transaction_id,
            'response_payload' => $payload,
            'paid_at' => $status === 'paid' ? now() : $payment->paid_at,
            'failed_at' => $status === 'failed' ? now() : $payment->failed_at,
        ]);

        PaymentLog::create([
            'payment_id' => $payment->id,
            'payment_account_id' => $payment->payment_account_id,
            'provider_code' => $payment->provider_code,
            'event' => 'callback',
            'status' => $status,
            'request_payload' => $payload,
            'response_payload' => ['accepted' => true],
        ]);

        return response()->json(['message' => 'Callback islendi.']);
    }
}
