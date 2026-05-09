<?php

namespace App\Services\Imports;

use Maatwebsite\Excel\Concerns\ToArray;

class ProductRowsImport implements ToArray
{
    public array $rows = [];

    public function array(array $array)
    {
        $this->rows = $array;
    }
}
