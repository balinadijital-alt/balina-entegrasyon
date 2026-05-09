<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class BackupDatabase extends Command
{
    protected $signature = 'balina:backup {--path=}';

    protected $description = 'Create a database backup for SQLite deployments.';

    public function handle(): int
    {
        if (config('database.default') !== 'sqlite') {
            $this->warn('Otomatik backup bu iskelette SQLite icin hazirlandi. MySQL icin mysqldump kullanin.');
            return self::FAILURE;
        }

        $source = config('database.connections.sqlite.database');
        $target = $this->option('path') ?: storage_path('app/backups/database-'.now()->format('Ymd-His').'.sqlite');
        File::ensureDirectoryExists(dirname($target));
        File::copy($source, $target);
        $this->info("Backup olusturuldu: {$target}");

        return self::SUCCESS;
    }
}
