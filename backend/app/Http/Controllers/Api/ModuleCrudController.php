<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ModuleRecordRequest;
use App\Jobs\Marketing\GenerateMarketingFeedJob;
use App\Models\B2B\Dealer;
use App\Models\B2B\DealerGroup;
use App\Models\B2B\DealerPrice;
use App\Models\B2B\DealerTransaction;
use App\Models\Catalog\ProductBarcodeBatch;
use App\Models\Catalog\ProductCustomField;
use App\Models\Catalog\ProductRelation;
use App\Models\Catalog\ProductReview;
use App\Models\Catalog\ProductVariantOption;
use App\Models\Cms\Banner;
use App\Models\Cms\BlogCategory;
use App\Models\Cms\BlogPost;
use App\Models\Cms\CmsPage;
use App\Models\Cms\Faq;
use App\Models\Cms\LegalDocument;
use App\Models\Cms\NavigationMenu;
use App\Models\Cms\Popup;
use App\Models\Marketing\AbandonedCart;
use App\Models\Marketing\Coupon;
use App\Models\Marketing\MarketingFeed;
use App\Models\Marketing\MessageTemplate;
use App\Models\Marketing\NotificationChannel;
use App\Models\Marketing\TrackingPixel;
use App\Models\Pricing\BulkPriceOperation;
use App\Models\Pricing\PriceCalculation;
use App\Models\Pricing\ProfitRule;
use App\Models\Seo\CurrencyRate;
use App\Models\Seo\Language;
use App\Models\Seo\Location;
use App\Models\Seo\RobotsRule;
use App\Models\Seo\SeoSetting;
use App\Models\Seo\SiteScript;
use App\Models\Seo\SitemapEntry;
use App\Models\Workflow\OrderNote;
use App\Models\Workflow\OrderOperationHistory;
use App\Models\Workflow\OrderWorkflowRule;
use App\Services\Audit\AuditLogger;
use App\Services\Pricing\PriceEngine;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class ModuleCrudController extends Controller
{
    private const MODELS = [
        'cms-pages' => CmsPage::class,
        'blog-categories' => BlogCategory::class,
        'blog-posts' => BlogPost::class,
        'banners' => Banner::class,
        'popups' => Popup::class,
        'navigation-menus' => NavigationMenu::class,
        'faqs' => Faq::class,
        'legal-documents' => LegalDocument::class,
        'coupons' => Coupon::class,
        'abandoned-carts' => AbandonedCart::class,
        'message-templates' => MessageTemplate::class,
        'notification-channels' => NotificationChannel::class,
        'marketing-feeds' => MarketingFeed::class,
        'tracking-pixels' => TrackingPixel::class,
        'product-variant-options' => ProductVariantOption::class,
        'product-relations' => ProductRelation::class,
        'product-custom-fields' => ProductCustomField::class,
        'product-barcode-batches' => ProductBarcodeBatch::class,
        'product-reviews' => ProductReview::class,
        'profit-rules' => ProfitRule::class,
        'bulk-price-operations' => BulkPriceOperation::class,
        'price-calculations' => PriceCalculation::class,
        'order-workflow-rules' => OrderWorkflowRule::class,
        'order-notes' => OrderNote::class,
        'order-operation-histories' => OrderOperationHistory::class,
        'dealer-groups' => DealerGroup::class,
        'dealers' => Dealer::class,
        'dealer-prices' => DealerPrice::class,
        'dealer-transactions' => DealerTransaction::class,
        'seo-settings' => SeoSetting::class,
        'site-scripts' => SiteScript::class,
        'sitemap-entries' => SitemapEntry::class,
        'robots-rules' => RobotsRule::class,
        'currency-rates' => CurrencyRate::class,
        'locations' => Location::class,
        'languages' => Language::class,
    ];

    public function __construct(private AuditLogger $audit, private PriceEngine $priceEngine) {}

    public function index(Request $request, string $module): JsonResponse
    {
        $model = $this->model($module);

        return response()->json($model::query()
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
            ->paginate(20));
    }

    public function store(ModuleRecordRequest $request, string $module): JsonResponse
    {
        $model = $this->model($module);
        $payload = $this->normalize($module, $request->validated());
        /** @var Model $record */
        $record = $model::create($payload);
        $this->afterStore($module, $record);
        $this->audit->log($request, $module, 'created', $record, null, $record->toArray());

        return response()->json($record, 201);
    }

    public function show(string $module, int $id): JsonResponse
    {
        return response()->json($this->model($module)::findOrFail($id));
    }

    public function update(ModuleRecordRequest $request, string $module, int $id): JsonResponse
    {
        $record = $this->model($module)::findOrFail($id);
        $old = $record->toArray();
        $record->update($this->normalize($module, $request->validated()));
        $this->audit->log($request, $module, 'updated', $record, $old, $record->fresh()->toArray());

        return response()->json($record->fresh());
    }

    public function destroy(Request $request, string $module, int $id): JsonResponse
    {
        $record = $this->model($module)::findOrFail($id);
        $old = $record->toArray();
        $record->delete();
        $this->audit->log($request, $module, 'deleted', $record, $old, null);

        return response()->json(status: 204);
    }

    private function model(string $module): string
    {
        abort_unless(isset(self::MODELS[$module]), 404, 'Modul bulunamadi.');

        return self::MODELS[$module];
    }

    private function normalize(string $module, array $payload): array
    {
        if ($module === 'price-calculations') {
            $payload = array_merge($payload, $this->priceEngine->calculate($payload));
        }

        $columns = Schema::getColumnListing((new ($this->model($module)))->getTable());

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
