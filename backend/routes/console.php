<?php

use Illuminate\Support\Facades\Artisan;

Artisan::command('about:balina', function () {
    $this->info('Balina marketplace integration backend.');
});
