<?php

namespace App\Services\Modules;

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

class ModuleRegistry
{
    public const MODELS = [
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

    public const DOMAINS = [
        'cms' => ['cms-pages', 'blog-categories', 'blog-posts', 'banners', 'popups', 'navigation-menus', 'faqs', 'legal-documents'],
        'marketing' => ['coupons', 'abandoned-carts', 'message-templates', 'notification-channels', 'marketing-feeds', 'tracking-pixels'],
        'catalog' => ['product-variant-options', 'product-relations', 'product-custom-fields', 'product-barcode-batches', 'product-reviews'],
        'pricing' => ['profit-rules', 'bulk-price-operations', 'price-calculations'],
        'workflow' => ['order-workflow-rules', 'order-notes', 'order-operation-histories'],
        'b2b' => ['dealer-groups', 'dealers', 'dealer-prices', 'dealer-transactions'],
        'seo' => ['seo-settings', 'site-scripts', 'sitemap-entries', 'robots-rules', 'currency-rates', 'locations', 'languages'],
    ];

    public function model(string $module): string
    {
        abort_unless(isset(self::MODELS[$module]), 404, 'Modul bulunamadi.');

        return self::MODELS[$module];
    }

    public function assertDomain(string $domain, string $module): void
    {
        abort_unless(in_array($module, self::DOMAINS[$domain] ?? [], true), 404, 'Modul bu domain icinde bulunamadi.');
    }

    public function modules(): array
    {
        return array_keys(self::MODELS);
    }
}
