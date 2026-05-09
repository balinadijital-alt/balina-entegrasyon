<?php

namespace App\Services\Accounting\Providers;

use App\Models\AccountingLog;
use App\Models\Invoice;
use App\Services\Accounting\Contracts\AccountingProvider;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

abstract class AbstractAccountingService implements AccountingProvider
{
    abstract protected function code(): string;

    public function createInvoice(Invoice $invoice): array
    {
        $payload = $this->payload($invoice);
        $response = $this->send($invoice, 'create_invoice', $payload);
        return [
            'status' => data_get($response, 'status', 'issued'),
            'invoice_number' => data_get($response, 'invoice_number') ?: 'INV-'.now()->format('Ymd').'-'.$invoice->id,
            'external_id' => data_get($response, 'external_id') ?: data_get($response, 'id'),
            'request_payload' => $payload,
            'response_payload' => $response,
            'issued_at' => now(),
        ];
    }

    public function createReturnInvoice(Invoice $invoice): array
    {
        $payload = $this->payload($invoice) + ['return' => true];
        $response = $this->send($invoice, 'return_invoice', $payload);
        return [
            'status' => data_get($response, 'status', 'issued'),
            'invoice_number' => data_get($response, 'invoice_number') ?: 'RET-'.now()->format('Ymd').'-'.$invoice->id,
            'external_id' => data_get($response, 'external_id') ?: data_get($response, 'id'),
            'request_payload' => $payload,
            'response_payload' => $response,
            'issued_at' => now(),
        ];
    }

    public function queryStatus(Invoice $invoice): array
    {
        $response = $this->send($invoice, 'query_status', ['external_id' => $invoice->external_id, 'invoice_number' => $invoice->invoice_number]);
        return ['status' => data_get($response, 'status', $invoice->status), 'response_payload' => $response];
    }

    public function createPdf(Invoice $invoice): array
    {
        $response = $this->send($invoice, 'pdf', ['external_id' => $invoice->external_id, 'invoice_number' => $invoice->invoice_number]);
        $path = $invoice->pdf_path;
        $pdfBase64 = data_get($response, 'pdf_base64');

        if ($pdfBase64) {
            $path = "invoices/{$invoice->id}-".Str::uuid().'.pdf';
            Storage::disk('public')->put($path, base64_decode($pdfBase64));
        }

        if (! $path) {
            $path = "invoices/{$invoice->id}-".Str::uuid().'.html';
            Storage::disk('public')->put($path, $this->fallbackPdf($invoice));
        }

        return ['pdf_path' => $path, 'pdf_url' => Storage::disk('public')->url($path), 'response_payload' => $response];
    }

    protected function send(Invoice $invoice, string $event, array $payload): array
    {
        $account = $invoice->account()->with('integration')->first();
        $endpoint = data_get($account?->settings, "endpoints.{$event}");
        $startedAt = microtime(true);

        if (! $account?->base_url || ! $endpoint) {
            $response = ['mock' => true, 'status' => 'issued', 'id' => strtoupper($this->code()).'-'.Str::uuid()];
            $this->log($invoice, $event, $payload, $response, null, $startedAt);
            return $response;
        }

        try {
            $http = Http::baseUrl($account->base_url)
                ->timeout((int) data_get($account->settings, 'timeout', 30))
                ->retry(3, 750, throw: false)
                ->acceptJson()
                ->withHeaders(array_filter(['X-Api-Key' => $account->api_key, 'User-Agent' => 'Balina-Entegrasyon/1.0']));
            /** @var Response $response */
            $response = $http->post($endpoint, $payload);
            $json = $response->json() ?? [];
            $this->log($invoice, $event, $payload, $json, null, $startedAt);
            if (! $response->successful()) throw new RuntimeException(data_get($json, 'message') ?: 'Muhasebe API istegi basarisiz oldu.');
            return $json;
        } catch (Throwable $exception) {
            $this->log($invoice, $event, $payload, null, $exception->getMessage(), $startedAt);
            throw $exception;
        }
    }

    protected function payload(Invoice $invoice): array
    {
        return [
            'invoice_id' => $invoice->id,
            'type' => $invoice->type,
            'scenario' => $invoice->scenario,
            'customer' => $invoice->currentAccount?->only(['name', 'email', 'tax_office', 'tax_number', 'identity_number', 'address', 'city', 'district']),
            'totals' => ['subtotal' => (float) $invoice->subtotal, 'tax_total' => (float) $invoice->tax_total, 'grand_total' => (float) $invoice->grand_total],
            'lines' => $invoice->lines ?? [],
        ];
    }

    protected function fallbackPdf(Invoice $invoice): string
    {
        return '<!doctype html><html><head><meta charset="utf-8"><title>Fatura</title><style>body{font-family:Arial,sans-serif;padding:24px}.box{border:1px solid #111;padding:18px;max-width:760px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}</style></head><body><div class="box"><h1>Fatura</h1><p><strong>No:</strong> '.e($invoice->invoice_number ?: $invoice->id).'</p><p><strong>Cari:</strong> '.e($invoice->currentAccount?->name).'</p><table><thead><tr><th>Urun</th><th>Adet</th><th>Tutar</th></tr></thead><tbody>'.collect($invoice->lines ?? [])->map(fn ($l) => '<tr><td>'.e($l['name'] ?? 'Kalem').'</td><td>'.e($l['quantity'] ?? 1).'</td><td>'.e($l['total'] ?? 0).'</td></tr>')->implode('').'</tbody></table><h2>Toplam: '.e($invoice->grand_total).' '.e($invoice->currency).'</h2></div></body></html>';
    }

    protected function log(Invoice $invoice, string $event, array $request, mixed $response, ?string $error, float $startedAt): void
    {
        AccountingLog::create([
            'accounting_account_id' => $invoice->accounting_account_id,
            'invoice_id' => $invoice->id,
            'provider_code' => $invoice->account?->integration?->code,
            'event' => $event,
            'status' => $invoice->status,
            'request_payload' => $request,
            'response_payload' => is_array($response) ? $response : null,
            'error_message' => $error,
            'duration_ms' => (int) ((microtime(true) - $startedAt) * 1000),
        ]);
    }
}
