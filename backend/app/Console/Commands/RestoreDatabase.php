<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

class RestoreDatabase extends Command
{
    protected $signature = 'balina:restore {path} {--force}';

    protected $description = 'Restore a SQLite database backup.';

    public function handle(): int
    {
        if (! $this->option('force') && ! $this->confirm('Mevcut veritabani yedekten geri yuklenecek. Devam edilsin mi?')) {
            return self::FAILURE;
        }

        $target = config('database.connections.sqlite.database');
        File::copy($this->argument('path'), $target);
        $this->info('Restore tamamlandi.');

        return self::SUCCESS;
    }
}
