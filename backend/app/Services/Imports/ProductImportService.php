<?php

namespace App\Services\Imports;

use App\Jobs\Imports\ProcessProductImportJob;
use App\Models\Product;
use App\Models\ProductImportError;
use App\Models\ProductImportRun;
use App\Models\XmlSource;
use App\Services\Media\ProductImageService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use RuntimeException;
use SimpleXMLElement;

class ProductImportService
{
    public const FIELDS = [
        'name' => 'Urun adi',
        'barcode' => 'Barkod',
        'sku' => 'SKU',
        'price' => 'Fiyat',
        'list_price' => 'Liste fiyati',
        'stock' => 'Stok',
        'brand' => 'Marka',
        'category' => 'Kategori',
        'description' => 'Aciklama',
        'image_urls' => 'Gorseller',
        'variant_group' => 'Varyant grubu',
        'variants' => 'Varyant alanlari',
    ];

    public function __construct(private ProductImageService $images)
    {
    }

    public function import(int $companyId, UploadedFile $file): array
    {
        $preview = $this->previewExcel($companyId, $file);
        $run = $this->queueExcel($companyId, $file, [
            'field_mapping' => $preview['suggested_mapping'],
            'options' => ['update_existing' => true],
        ]);

        return [
            'message' => 'Excel import kuyruga alindi.',
            'queued' => true,
            'import_run_id' => $run->id,
            'created' => 0,
            'updated' => 0,
            'errors' => [],
        ];
    }

    public function previewExcel(int $companyId, UploadedFile $file, array $mapping = []): array
    {
        $parsed = $this->parseExcel($file->getRealPath());

        return $this->previewRows($companyId, 'excel', $parsed['headers'], $parsed['rows'], $mapping);
    }

    public function previewXmlSource(XmlSource $source, array $mapping = []): array
    {
        $parsed = $this->parseXml($this->fetchXml($source));

        return $this->previewRows($source->company_id, 'xml', $parsed['headers'], $parsed['rows'], $mapping ?: ($source->field_mapping ?? []));
    }

    public function queueExcel(int $companyId, UploadedFile $file, array $data): ProductImportRun
    {
        $path = $file->store('imports/excel');
        $run = ProductImportRun::create([
            'company_id' => $companyId,
            'source_type' => 'excel',
            'supplier_name' => $data['supplier_name'] ?? null,
            'original_filename' => $file->getClientOriginalName(),
            'stored_path' => $path,
            'field_mapping' => $data['field_mapping'] ?? [],
            'options' => $this->defaultOptions($data['options'] ?? []),
            'status' => 'queued',
            'queued_at' => now(),
        ]);

        ProcessProductImportJob::dispatch($run);

        return $run;
    }

    public function queueXml(XmlSource $source, array $data = []): ProductImportRun
    {
        $run = ProductImportRun::create([
            'company_id' => $source->company_id,
            'xml_source_id' => $source->id,
            'source_type' => 'xml',
            'supplier_name' => $data['supplier_name'] ?? $source->supplier_name,
            'field_mapping' => $data['field_mapping'] ?? $source->field_mapping ?? [],
            'options' => $this->defaultOptions($data['options'] ?? $source->options ?? []),
            'status' => 'queued',
            'queued_at' => now(),
        ]);

        ProcessProductImportJob::dispatch($run);

        return $run;
    }

    public function retry(ProductImportRun $run): ProductImportRun
    {
        if (! in_array($run->status, ['failed', 'completed'], true)) {
            throw new RuntimeException('Sadece bitmis veya basarisiz import tekrar kuyruga alinabilir.');
        }

        $run->errors()->delete();
        $run->update([
            'status' => 'queued',
            'job_uuid' => null,
            'processed_rows' => 0,
            'success_count' => 0,
            'error_count' => 0,
            'created_count' => 0,
            'updated_count' => 0,
            'skipped_count' => 0,
            'progress' => 0,
            'report' => null,
            'error_message' => null,
            'queued_at' => now(),
            'started_at' => null,
            'finished_at' => null,
        ]);

        ProcessProductImportJob::dispatch($run);

        return $run;
    }

    public function process(ProductImportRun $run, ?string $jobUuid = null, int $attempts = 0): array
    {
        $lock = Cache::lock("product-import:{$run->company_id}:{$run->source_type}:{$run->xml_source_id}", 3600);

        if (! $lock->get()) {
            throw new RuntimeException('Bu kaynak icin import islemi zaten calisiyor.');
        }

        try {
            $parsed = $this->rowsForRun($run->fresh(['xmlSource']));
            $rows = collect($parsed['rows']);
            $total = $rows->count();
            $seen = collect();
            $stats = ['created' => 0, 'updated' => 0, 'skipped' => 0, 'filtered' => 0, 'errors' => 0, 'success' => 0];

            $run->update([
                'job_uuid' => $jobUuid,
                'status' => 'running',
                'total_rows' => $total,
                'started_at' => now(),
                'error_message' => null,
            ]);

            $rows->each(function (array $raw, int $index) use ($run, $total, $seen, &$stats) {
                $rowNumber = $index + 2;
                $payload = $this->mapRow($raw, $run->field_mapping ?? []);
                $payload = $this->applyTransforms($payload, $run->options ?? []);

                if ($this->shouldSkipRow($payload, $run->options ?? [])) {
                    if (! empty($payload['sku'])) {
                        $seen->push((string) $payload['sku']);
                    }
                    $stats['filtered']++;
                    $stats['skipped']++;
                    $this->tick($run, $index + 1, $total, $stats);
                    return;
                }

                $payload = $this->applyPriceRules($payload, $run->options ?? []);
                $validation = $this->validatePayload($payload, $run->options ?? []);

                if ($validation !== null) {
                    $this->recordError($run, $rowNumber, $payload, $validation, $raw);
                    $stats['errors']++;
                    $this->tick($run, $index + 1, $total, $stats);
                    return;
                }

                $result = $this->upsertProduct($run, $payload);
                $stats[$result]++;
                if ($result !== 'skipped') {
                    $stats['success']++;
                }

                if (! empty($payload['sku'])) {
                    $seen->push((string) $payload['sku']);
                }

                $this->tick($run, $index + 1, $total, $stats);
            });

            $missingResult = $this->applyMissingStrategy($run, $seen);
            $report = [
                'created' => $stats['created'],
                'updated' => $stats['updated'],
                'skipped' => $stats['skipped'],
                'filtered' => $stats['filtered'],
                'errors' => $stats['errors'],
                'deactivated' => $missingResult['deactivated'],
                'zero_stocked' => $missingResult['zero_stocked'],
                'filtered_count' => $stats['filtered'],
                'zero_stocked_count' => $missingResult['zero_stocked'],
                'deactivated_count' => $missingResult['deactivated'],
            ];

            $run->update([
                'status' => $stats['errors'] > 0 ? 'completed_with_errors' : 'completed',
                'progress' => 100,
                'report' => $report,
                'finished_at' => now(),
            ]);

            $run->xmlSource?->update([
                'last_status' => $run->status,
                'last_error' => null,
                'last_import_at' => now(),
            ]);

            return ['message' => 'Urun import tamamlandi.', 'count' => $stats['success'], ...$report];
        } catch (\Throwable $exception) {
            $run->update([
                'status' => 'failed',
                'error_message' => $exception->getMessage(),
                'finished_at' => now(),
            ]);
            $run->xmlSource?->update(['last_status' => 'failed', 'last_error' => $exception->getMessage()]);
            throw $exception;
        } finally {
            $lock->forceRelease();
        }
    }

    private function previewRows(int $companyId, string $sourceType, array $headers, array $rows, array $mapping): array
    {
        $mapping = $mapping ?: $this->suggestMapping($headers);
        $valid = [];
        $invalid = [];

        foreach (array_slice($rows, 0, 25) as $index => $row) {
            $payload = $this->mapRow($row, $mapping);
            $message = $this->validatePayload($payload, []);
            $entry = ['row' => $index + 2, 'raw' => $row, 'mapped' => $payload, 'message' => $message];
            $message ? $invalid[] = $entry : $valid[] = $entry;
        }

        return [
            'company_id' => $companyId,
            'source_type' => $sourceType,
            'headers' => $headers,
            'suggested_mapping' => $mapping,
            'valid_rows' => $valid,
            'invalid_rows' => $invalid,
            'sample_rows' => array_slice($rows, 0, 10),
            'total_previewed' => min(count($rows), 25),
        ];
    }

    private function rowsForRun(ProductImportRun $run): array
    {
        if ($run->source_type === 'xml') {
            return $this->parseXml($this->fetchXml($run->xmlSource));
        }

        if (! $run->stored_path || ! Storage::exists($run->stored_path)) {
            throw new RuntimeException('Import dosyasi bulunamadi.');
        }

        return $this->parseExcel(Storage::path($run->stored_path));
    }

    private function parseExcel(string $path): array
    {
        $spreadsheet = IOFactory::load($path);
        $rows = $spreadsheet->getActiveSheet()->toArray(null, true, true, true);
        $first = array_shift($rows) ?? [];
        $headers = collect($first)->map(fn ($value) => $this->normalizeHeader($value))->filter()->values()->all();
        $records = [];

        foreach ($rows as $row) {
            $values = array_values($row);
            $record = [];
            foreach ($headers as $index => $header) {
                $record[$header] = $values[$index] ?? null;
            }
            if (collect($record)->filter(fn ($value) => $value !== null && $value !== '')->isNotEmpty()) {
                $records[] = $record;
            }
        }

        return ['headers' => $headers, 'rows' => $records];
    }

    private function fetchXml(XmlSource $source): string
    {
        $request = Http::timeout(45)->retry(2, 1000, throw: false);

        if ($source->username && $source->password) {
            $request = $request->withBasicAuth($source->username, $source->password);
        }

        $response = $request->get($source->url);

        if (! $response->successful()) {
            throw new RuntimeException("XML kaynagi okunamadi: HTTP {$response->status()}");
        }

        return $response->body();
    }

    private function parseXml(string $xml): array
    {
        $document = simplexml_load_string($xml, SimpleXMLElement::class, LIBXML_NOCDATA);

        if (! $document) {
            throw new RuntimeException('XML dosyasi okunamadi.');
        }

        $items = $this->detectXmlItems($document);
        $records = collect($items)->map(fn (SimpleXMLElement $item) => $this->flattenXml($item))->values()->all();
        $headers = collect($records)->flatMap(fn ($row) => array_keys($row))->unique()->values()->all();

        return ['headers' => $headers, 'rows' => $records];
    }

    private function detectXmlItems(SimpleXMLElement $document): array
    {
        $children = iterator_to_array($document->children(), false);

        if ($children === []) {
            return [];
        }

        $first = reset($children);
        $grandChildren = $first instanceof SimpleXMLElement ? iterator_to_array($first->children(), false) : [];

        if ($grandChildren !== [] && count($children) === 1) {
            return array_values($grandChildren);
        }

        return array_values($children);
    }

    private function flattenXml(SimpleXMLElement $node, string $prefix = ''): array
    {
        $result = [];

        foreach ($node->children() as $key => $child) {
            $path = $prefix ? "{$prefix}.{$key}" : $key;

            if ($child->children()->count() > 0) {
                $result += $this->flattenXml($child, $path);
            } else {
                $result[$this->normalizeHeader($path)] = trim((string) $child);
            }
        }

        foreach ($node->attributes() as $key => $value) {
            $result[$this->normalizeHeader($prefix ? "{$prefix}.{$key}" : $key)] = trim((string) $value);
        }

        return $result;
    }

    private function mapRow(array $row, array $mapping): array
    {
        $payload = [];

        foreach (array_keys(self::FIELDS) as $field) {
            $source = $mapping[$field] ?? null;
            $payload[$field] = $source ? ($row[$this->normalizeHeader($source)] ?? $row[$source] ?? null) : null;
        }

        return $payload;
    }

    private function validatePayload(array $payload, array $options): ?string
    {
        if (empty($payload['sku']) && empty($payload['barcode'])) {
            return 'SKU veya barkod zorunludur.';
        }

        if (empty($payload['name']) && empty($options['update_stock_price_only'])) {
            return 'Urun adi zorunludur.';
        }

        if ($payload['price'] !== null && $payload['price'] !== '' && ! is_numeric(str_replace(',', '.', (string) $payload['price']))) {
            return 'Fiyat sayisal olmalidir.';
        }

        if ($payload['stock'] !== null && $payload['stock'] !== '' && ! is_numeric($payload['stock'])) {
            return 'Stok sayisal olmalidir.';
        }

        return null;
    }

    private function upsertProduct(ProductImportRun $run, array $payload): string
    {
        $options = $run->options ?? [];
        $matchBy = $options['match_by'] ?? 'sku';
        $query = Product::where('company_id', $run->company_id);
        $identifier = $matchBy === 'barcode' && ! empty($payload['barcode']) ? 'barcode' : 'sku';
        $product = $query->where($identifier, (string) $payload[$identifier])->first();

        if ($product && empty($options['update_existing'])) {
            return 'skipped';
        }

        if (! $product && ! empty($options['update_stock_price_only'])) {
            return 'skipped';
        }

        $data = $this->productData($run, $payload, (bool) ($options['update_stock_price_only'] ?? false));
        $product = $product
            ? tap($product)->update($data)
            : Product::create($data + ['company_id' => $run->company_id, 'status' => 'active']);

        if (! empty($options['download_images'])) {
            $this->syncImages($product, $payload['image_urls'] ?? '', (int) data_get($options, 'image_strategy.max_image_count', 8));
        }

        return $product->wasRecentlyCreated ? 'created' : 'updated';
    }

    private function productData(ProductImportRun $run, array $payload, bool $stockPriceOnly): array
    {
        $base = [
            'price' => $this->decimal($payload['price'] ?? 0),
            'stock' => (int) ($payload['stock'] ?? 0),
            'last_import_run_id' => $run->id,
            'last_imported_at' => now(),
        ];

        if ($stockPriceOnly) {
            return $base;
        }

        return $base + [
            'supplier_name' => $run->supplier_name,
            'sku' => (string) ($payload['sku'] ?: $payload['barcode']),
            'barcode' => $payload['barcode'] ?: null,
            'name' => (string) $payload['name'],
            'description' => $payload['description'] ?: null,
            'brand' => $payload['brand'] ?: null,
            'category' => $payload['category'] ?: null,
            'list_price' => $payload['list_price'] !== null && $payload['list_price'] !== '' ? $this->decimal($payload['list_price']) : null,
            'variant_group' => $payload['variant_group'] ?: null,
            'variant_options' => $this->variantOptions($payload['variants'] ?? null),
            'vat_rate' => 20,
            'status' => 'active',
        ];
    }

    private function syncImages(Product $product, ?string $value, int $maxImages = 8): void
    {
        $urls = collect(preg_split('/[\n,|;]+/', (string) $value))
            ->map(fn ($url) => trim($url))
            ->filter()
            ->take(max(1, min(8, $maxImages)))
            ->values();

        $urls->each(fn ($url, $index) => $this->images->storeFromUrl($product, $url, $index));
    }

    private function recordError(ProductImportRun $run, int $rowNumber, array $payload, string $message, array $raw): void
    {
        ProductImportError::create([
            'product_import_run_id' => $run->id,
            'row_number' => $rowNumber,
            'sku' => $payload['sku'] ?? null,
            'barcode' => $payload['barcode'] ?? null,
            'message' => $message,
            'payload' => ['mapped' => $payload, 'raw' => $raw],
        ]);
    }

    private function tick(ProductImportRun $run, int $processed, int $total, array $stats): void
    {
        if ($processed % 10 !== 0 && $processed !== $total) {
            return;
        }

        $run->update([
            'processed_rows' => $processed,
            'progress' => $total > 0 ? (int) floor(($processed / $total) * 100) : 100,
            'success_count' => $stats['success'],
            'error_count' => $stats['errors'],
            'created_count' => $stats['created'],
            'updated_count' => $stats['updated'],
            'skipped_count' => $stats['skipped'],
        ]);
    }

    private function suggestMapping(array $headers): array
    {
        $aliases = [
            'name' => ['name', 'urun_adi', 'urunadi', 'product_name', 'baslik'],
            'barcode' => ['barcode', 'barkod', 'ean'],
            'sku' => ['sku', 'stok_kodu', 'stock_code', 'merchant_sku'],
            'price' => ['price', 'fiyat', 'sale_price', 'satis_fiyati'],
            'list_price' => ['list_price', 'liste_fiyati'],
            'stock' => ['stock', 'stok', 'quantity', 'adet'],
            'brand' => ['brand', 'marka'],
            'category' => ['category', 'kategori'],
            'description' => ['description', 'aciklama', 'urun_aciklamasi'],
            'image_urls' => ['image', 'images', 'gorsel', 'gorseller', 'image_urls'],
            'variant_group' => ['variant_group', 'varyant_grup', 'varyant_group_id'],
            'variants' => ['variants', 'varyant', 'varyantlar'],
        ];

        $normalized = collect($headers)->mapWithKeys(fn ($header) => [$this->normalizeHeader($header) => $header]);

        return collect($aliases)->mapWithKeys(function (array $candidates, string $field) use ($normalized) {
            foreach ($candidates as $candidate) {
                if ($normalized->has($candidate)) {
                    return [$field => $normalized[$candidate]];
                }
            }

            return [$field => ''];
        })->all();
    }

    private function defaultOptions(array $options): array
    {
        return [
            'match_by' => $options['match_by'] ?? 'sku',
            'update_existing' => filter_var($options['update_existing'] ?? true, FILTER_VALIDATE_BOOLEAN),
            'deactivate_missing' => filter_var($options['deactivate_missing'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'update_stock_price_only' => filter_var($options['update_stock_price_only'] ?? false, FILTER_VALIDATE_BOOLEAN),
            'download_images' => filter_var($options['download_images'] ?? data_get($options, 'image_strategy.download_images', false), FILTER_VALIDATE_BOOLEAN),
            'filters' => [
                'minimum_stock' => $this->nullableNumber(data_get($options, 'filters.minimum_stock')),
                'minimum_price' => $this->nullableNumber(data_get($options, 'filters.minimum_price')),
                'include_categories' => $this->listOption(data_get($options, 'filters.include_categories', [])),
                'exclude_categories' => $this->listOption(data_get($options, 'filters.exclude_categories', [])),
                'exclude_brands' => $this->listOption(data_get($options, 'filters.exclude_brands', [])),
            ],
            'pricing' => [
                'source_profit_rate' => $this->nullableNumber(data_get($options, 'pricing.source_profit_rate')),
                'price_multiplier' => $this->nullableNumber(data_get($options, 'pricing.price_multiplier')),
                'rounding_mode' => in_array(data_get($options, 'pricing.rounding_mode'), ['none', 'nearest_integer', 'nearest_90', 'nearest_99'], true)
                    ? data_get($options, 'pricing.rounding_mode')
                    : 'none',
            ],
            'transforms' => [
                'title_prefix' => (string) data_get($options, 'transforms.title_prefix', ''),
                'title_suffix' => (string) data_get($options, 'transforms.title_suffix', ''),
                'strip_html_description' => filter_var(data_get($options, 'transforms.strip_html_description', false), FILTER_VALIDATE_BOOLEAN),
            ],
            'stock_strategy' => [
                'missing_product_action' => data_get($options, 'stock_strategy.missing_product_action')
                    ?: (filter_var($options['deactivate_missing'] ?? false, FILTER_VALIDATE_BOOLEAN) ? 'passive_missing' : 'none'),
            ],
            'image_strategy' => [
                'download_images' => filter_var(data_get($options, 'image_strategy.download_images', $options['download_images'] ?? false), FILTER_VALIDATE_BOOLEAN),
                'max_image_count' => max(1, min(8, (int) data_get($options, 'image_strategy.max_image_count', 8))),
            ],
        ];
    }

    private function shouldSkipRow(array $payload, array $options): bool
    {
        $filters = $options['filters'] ?? [];

        if (($filters['minimum_stock'] ?? null) !== null && (int) ($payload['stock'] ?? 0) < (int) $filters['minimum_stock']) {
            return true;
        }

        if (($filters['minimum_price'] ?? null) !== null && $this->decimal($payload['price'] ?? 0) < (float) $filters['minimum_price']) {
            return true;
        }

        $category = $this->normalizeRuleValue($payload['category'] ?? '');
        $brand = $this->normalizeRuleValue($payload['brand'] ?? '');
        $includeCategories = $this->normalizedList($filters['include_categories'] ?? []);
        $excludeCategories = $this->normalizedList($filters['exclude_categories'] ?? []);
        $excludeBrands = $this->normalizedList($filters['exclude_brands'] ?? []);

        if ($includeCategories !== [] && ! in_array($category, $includeCategories, true)) {
            return true;
        }

        if ($excludeCategories !== [] && in_array($category, $excludeCategories, true)) {
            return true;
        }

        return $excludeBrands !== [] && in_array($brand, $excludeBrands, true);
    }

    private function applyPriceRules(array $payload, array $options): array
    {
        if ($payload['price'] === null || $payload['price'] === '') {
            return $payload;
        }

        $price = $this->decimal($payload['price']);
        $pricing = $options['pricing'] ?? [];
        $multiplier = $pricing['price_multiplier'] ?? null;
        $profitRate = $pricing['source_profit_rate'] ?? null;

        if ($multiplier !== null && (float) $multiplier > 0) {
            $price *= (float) $multiplier;
        }

        if ($profitRate !== null && (float) $profitRate !== 0.0) {
            $price *= 1 + ((float) $profitRate / 100);
        }

        $payload['price'] = $this->roundPrice($price, $pricing['rounding_mode'] ?? 'none');

        return $payload;
    }

    private function applyTransforms(array $payload, array $options): array
    {
        $transforms = $options['transforms'] ?? [];
        $name = trim((string) ($payload['name'] ?? ''));

        if ($name !== '') {
            $payload['name'] = trim(trim((string) ($transforms['title_prefix'] ?? '')).' '.$name.' '.trim((string) ($transforms['title_suffix'] ?? '')));
        }

        if (! empty($transforms['strip_html_description']) && isset($payload['description'])) {
            $payload['description'] = trim(strip_tags((string) $payload['description']));
        }

        return $payload;
    }

    private function applyMissingStrategy(ProductImportRun $run, Collection $seen): array
    {
        $action = $this->resolveMissingStrategy($run->options ?? []);

        if ($action === 'none' || $seen->isEmpty()) {
            return ['deactivated' => 0, 'zero_stocked' => 0];
        }

        $query = Product::where('company_id', $run->company_id)
            ->when($run->supplier_name, fn ($query) => $query->where('supplier_name', $run->supplier_name))
            ->whereNotIn('sku', $seen->unique()->values()->all());

        if ($action === 'zero_stock_missing') {
            return ['deactivated' => 0, 'zero_stocked' => $query->update(['stock' => 0])];
        }

        return ['deactivated' => $query->update(['status' => 'passive']), 'zero_stocked' => 0];
    }

    private function resolveMissingStrategy(array $options): string
    {
        $action = data_get($options, 'stock_strategy.missing_product_action', 'none');

        if ($action === 'passive_missing' || (! empty($options['deactivate_missing']) && $action === 'none')) {
            return 'passive_missing';
        }

        return $action === 'zero_stock_missing' ? 'zero_stock_missing' : 'none';
    }

    private function roundPrice(float $price, string $mode): float
    {
        return match ($mode) {
            'nearest_integer' => round($price),
            'nearest_90' => floor($price) + 0.90,
            'nearest_99' => floor($price) + 0.99,
            default => round($price, 2),
        };
    }

    private function nullableNumber(mixed $value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_numeric(str_replace(',', '.', (string) $value)) ? $this->decimal($value) : null;
    }

    private function listOption(mixed $value): array
    {
        if (is_array($value)) {
            return array_values(array_filter(array_map('trim', $value), fn ($item) => $item !== ''));
        }

        return collect(preg_split('/[\n,;]+/', (string) $value))
            ->map(fn ($item) => trim($item))
            ->filter()
            ->values()
            ->all();
    }

    private function normalizedList(array $values): array
    {
        return collect($values)->map(fn ($value) => $this->normalizeRuleValue($value))->filter()->values()->all();
    }

    private function normalizeRuleValue(mixed $value): string
    {
        return Str::of((string) $value)->lower()->ascii()->trim()->toString();
    }

    private function decimal(mixed $value): float
    {
        return (float) str_replace(',', '.', (string) $value);
    }

    private function variantOptions(mixed $value): ?array
    {
        if (! $value) {
            return null;
        }

        if (is_array($value)) {
            return $value;
        }

        $decoded = json_decode((string) $value, true);
        if (json_last_error() === JSON_ERROR_NONE) {
            return $decoded;
        }

        return collect(explode('|', (string) $value))
            ->mapWithKeys(function (string $part) {
                [$key, $val] = array_pad(explode(':', $part, 2), 2, null);
                return $key ? [trim($key) => trim((string) $val)] : [];
            })
            ->filter()
            ->all();
    }

    private function normalizeHeader(mixed $value): string
    {
        return Str::of((string) $value)
            ->lower()
            ->ascii()
            ->replaceMatches('/[^a-z0-9_.]+/', '_')
            ->trim('_')
            ->toString();
    }
}
