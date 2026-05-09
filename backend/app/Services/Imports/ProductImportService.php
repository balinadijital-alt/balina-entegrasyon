<?php

namespace App\Services\Imports;

use App\Models\Product;
use Illuminate\Http\UploadedFile;
use Maatwebsite\Excel\Facades\Excel;

class ProductImportService
{
    public function import(int $companyId, UploadedFile $file): array
    {
        $rows = Excel::toArray(new ProductRowsImport(), $file)[0] ?? [];
        $header = array_map(fn ($value) => strtolower(trim((string) $value)), array_shift($rows) ?? []);
        $created = 0;
        $updated = 0;
        $errors = [];

        foreach ($rows as $index => $row) {
            $payload = array_combine($header, $row);

            if (! $payload || empty($payload['sku']) || empty($payload['name'])) {
                $errors[] = ['row' => $index + 2, 'message' => 'SKU ve urun adi zorunludur.'];
                continue;
            }

            $product = Product::updateOrCreate(
                ['company_id' => $companyId, 'sku' => (string) $payload['sku']],
                [
                    'barcode' => $payload['barcode'] ?? null,
                    'name' => $payload['name'],
                    'description' => $payload['description'] ?? null,
                    'brand' => $payload['brand'] ?? null,
                    'category' => $payload['category'] ?? null,
                    'price' => (float) ($payload['price'] ?? 0),
                    'stock' => (int) ($payload['stock'] ?? 0),
                    'vat_rate' => (int) ($payload['vat_rate'] ?? 20),
                    'status' => $payload['status'] ?? 'draft',
                ]
            );

            $product->wasRecentlyCreated ? $created++ : $updated++;
        }

        return compact('created', 'updated', 'errors');
    }
}
