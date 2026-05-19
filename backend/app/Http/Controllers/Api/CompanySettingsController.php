<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CompanySetting;
use App\Services\Notifications\NotificationRuntimeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class CompanySettingsController extends Controller
{
    private const KEYS = ['notifications', 'email', 'webhooks', 'localization', 'theme', 'security'];

    public function show(Request $request): JsonResponse
    {
        $settings = CompanySetting::query()
            ->where('company_id', $this->companyId($request))
            ->first();

        return response()->json($this->responseSettings($settings?->settings));
    }

    public function update(Request $request): JsonResponse
    {
        $payload = $request->validate([
            'company_id' => ['nullable', 'exists:companies,id'],
            'notifications' => ['nullable', 'array'],
            'email' => ['nullable', 'array'],
            'webhooks' => ['nullable', 'array'],
            'localization' => ['nullable', 'array'],
            'theme' => ['nullable', 'array'],
            'security' => ['nullable', 'array'],
        ]);

        $companyId = $this->companyId($request);
        $record = CompanySetting::query()->firstOrCreate(['company_id' => $companyId]);
        unset($payload['company_id']);
        $record->settings = array_replace_recursive($this->normalize($record->settings), $payload);
        $record->save();

        return response()->json($this->responseSettings($record->settings));
    }

    public function testWebhook(Request $request, NotificationRuntimeService $runtime): JsonResponse
    {
        $request->validate([
            'company_id' => ['nullable', 'exists:companies,id'],
        ]);

        try {
            return response()->json($runtime->sendTest($this->companyId($request)));
        } catch (Throwable $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
            ], 422);
        }
    }

    private function companyId(Request $request): ?int
    {
        if ($request->user()?->hasRole('super_admin')) {
            return $request->filled('company_id') ? $request->integer('company_id') : null;
        }

        return (int) $request->attributes->get('tenant_company_id', $request->user()?->company_id);
    }

    private function normalize(?array $settings): array
    {
        $settings = $settings ?? [];

        return collect(self::KEYS)
            ->mapWithKeys(fn (string $key) => [$key => is_array($settings[$key] ?? null) ? $settings[$key] : []])
            ->all();
    }

    private function responseSettings(?array $settings): array
    {
        $response = [];

        foreach ($this->normalize($settings) as $key => $section) {
            $response[$key] = $section === [] ? new \stdClass() : $section;
        }

        return $response;
    }
}
