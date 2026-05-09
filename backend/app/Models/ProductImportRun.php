<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductImportRun extends Model
{
    protected $fillable = [
        'company_id',
        'xml_source_id',
        'source_type',
        'supplier_name',
        'original_filename',
        'stored_path',
        'field_mapping',
        'options',
        'queue',
        'job_uuid',
        'status',
        'total_rows',
        'processed_rows',
        'success_count',
        'error_count',
        'created_count',
        'updated_count',
        'skipped_count',
        'progress',
        'report',
        'error_message',
        'queued_at',
        'started_at',
        'finished_at',
    ];

    protected function casts(): array
    {
        return [
            'field_mapping' => 'array',
            'options' => 'array',
            'report' => 'array',
            'queued_at' => 'datetime',
            'started_at' => 'datetime',
            'finished_at' => 'datetime',
        ];
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    public function xmlSource(): BelongsTo
    {
        return $this->belongsTo(XmlSource::class);
    }

    public function errors(): HasMany
    {
        return $this->hasMany(ProductImportError::class);
    }
}
