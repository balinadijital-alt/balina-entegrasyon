<?php

namespace App\Services\Modules;

use App\Jobs\Marketing\GenerateMarketingFeedJob;
use App\Services\Audit\AuditLogger;
use App\Services\Pricing\PriceEngine;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class ModuleResourceService
{
    public function __construct(
        private ModuleRegistry $registry,
        private AuditLogger $audit,
        private PriceEngine $priceEngine,
    ) {}

    public function paginate(Request $request, string $module)
    {
        $model = $this->registry->model($module);

        return $model::query()
            ->when($request->filled('company_id'), fn ($query) => $query->where('company_id', $request->integer('company_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', $request->string('status')))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = $request->string('search');
                $query->where(fn ($inner) => $inner
                    ->where('title', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%"));
            })
            ->latest()
            ->paginate(20);
    }

    public function create(Request $request, string $module, array $payload): Model
    {
        $model = $this->registry->model($module);
        $record = $model::create($this->normalize($module, $payload));
        $this->afterStore($module, $record);
        $this->audit->log($request, $module, 'created', $record, null, $record->toArray());

        return $record;
    }

    public function find(string $module, int $id): Model
    {
        return $this->registry->model($module)::findOrFail($id);
    }

    public function update(Request $request, string $module, int $id, array $payload): Model
    {
        $record = $this->find($module, $id);
        $old = $record->toArray();
        $record->update($this->normalize($module, $payload));
        $this->audit->log($request, $module, 'updated', $record, $old, $record->fresh()->toArray());

        return $record->fresh();
    }

    public function delete(Request $request, string $module, int $id): void
    {
        $record = $this->find($module, $id);
        $old = $record->toArray();
        $record->delete();
        $this->audit->log($request, $module, 'deleted', $record, $old, null);
    }

    private function normalize(string $module, array $payload): array
    {
        if ($module === 'price-calculations') {
            $payload = array_merge($payload, $this->priceEngine->calculate($payload));
        }

        $columns = Schema::getColumnListing((new ($this->registry->model($module)))->getTable());

        return collect($payload)
            ->filter(fn ($value) => $value !== null)
            ->only($columns)
            ->all();
    }

    private function afterStore(string $module, Model $record): void
    {
        if ($module === 'marketing-feeds') {
            GenerateMarketingFeedJob::dispatch($record->id)->onQueue('marketing');
        }
    }
}
