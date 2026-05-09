<?php

namespace App\Console\Commands;

use App\Models\XmlSource;
use App\Services\Imports\ProductImportService;
use Illuminate\Console\Command;

class DispatchDueXmlImports extends Command
{
    protected $signature = 'imports:dispatch-due-xml';

    protected $description = 'Dispatch due XML product import sources.';

    public function handle(ProductImportService $service): int
    {
        XmlSource::where('is_active', true)->each(function (XmlSource $source) use ($service) {
            $last = $source->last_import_at;
            $frequency = max(5, (int) $source->frequency_minutes);

            if ($last && $last->gt(now()->subMinutes($frequency))) {
                return;
            }

            $service->queueXml($source);
            $this->info("Queued XML import source {$source->id}");
        });

        return self::SUCCESS;
    }
}
