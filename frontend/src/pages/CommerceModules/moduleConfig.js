export const moduleGroups = [
  {
    label: 'CMS',
    items: [
      { path: 'cms/pages', module: 'cms-pages', title: 'Sayfa Yonetimi', primary: 'title', secondary: 'slug', fields: ['title', 'slug', 'status', 'content'] },
      { path: 'cms/blog-categories', module: 'blog-categories', title: 'Blog Kategorileri', primary: 'name', secondary: 'slug', fields: ['name', 'slug', 'status'] },
      { path: 'cms/blog-posts', module: 'blog-posts', title: 'Blog Yonetimi', primary: 'title', secondary: 'slug', fields: ['title', 'slug', 'status', 'excerpt', 'content'] },
      { path: 'cms/banners', module: 'banners', title: 'Banner / Slider', primary: 'title', secondary: 'placement', fields: ['title', 'placement', 'status', 'content'] },
      { path: 'cms/popups', module: 'popups', title: 'Popup Yonetimi', primary: 'title', secondary: 'trigger', fields: ['title', 'trigger', 'status', 'content'] },
      { path: 'cms/menus', module: 'navigation-menus', title: 'Menu Header Footer', primary: 'name', secondary: 'location', fields: ['name', 'location', 'status', 'settings'] },
      { path: 'cms/faqs', module: 'faqs', title: 'SSS Yonetimi', primary: 'title', secondary: 'category', fields: ['title', 'category', 'status', 'content'] },
      { path: 'cms/legal', module: 'legal-documents', title: 'Sozlesmeler ve Cerez', primary: 'title', secondary: 'type', fields: ['title', 'type', 'status', 'content'] },
    ],
  },
  {
    label: 'Pazarlama',
    items: [
      { path: 'marketing/coupons', module: 'coupons', title: 'Kuponlar', primary: 'name', secondary: 'code', fields: ['name', 'code', 'type', 'value', 'minimum_cart_amount', 'status'] },
      { path: 'marketing/abandoned-carts', module: 'abandoned-carts', title: 'Terk Edilmis Sepet', primary: 'customer_email', secondary: 'status', fields: ['customer_email', 'customer_phone', 'cart_total', 'status', 'items'] },
      { path: 'marketing/email-templates', module: 'message-templates', title: 'E-posta Sablonlari', primary: 'name', secondary: 'code', defaults: { channel: 'email' }, fields: ['name', 'channel', 'code', 'subject', 'body'] },
      { path: 'marketing/sms-templates', module: 'message-templates', title: 'SMS Sablonlari', primary: 'name', secondary: 'code', defaults: { channel: 'sms' }, fields: ['name', 'channel', 'code', 'body'] },
      { path: 'marketing/whatsapp', module: 'notification-channels', title: 'WhatsApp Bildirimleri', primary: 'name', secondary: 'channel', defaults: { channel: 'whatsapp' }, fields: ['name', 'channel', 'status', 'settings'] },
      { path: 'marketing/feeds', module: 'marketing-feeds', title: 'Google Merchant / Meta Feed', primary: 'title', secondary: 'provider', fields: ['title', 'provider', 'status', 'settings'] },
      { path: 'marketing/pixels', module: 'tracking-pixels', title: 'Analytics ve Pixel Ayarlari', primary: 'title', secondary: 'provider', fields: ['title', 'provider', 'status', 'settings'] },
    ],
  },
  {
    label: 'Gelistirilmis Urun',
    items: [
      { path: 'catalog/variants', module: 'product-variant-options', title: 'Varyant Baslik/Deger', primary: 'name', secondary: 'values', fields: ['name', 'values'] },
      { path: 'catalog/relations', module: 'product-relations', title: 'Urun Iliskileri', primary: 'type', secondary: 'product_id', fields: ['product_id', 'related_product_id', 'type'] },
      { path: 'catalog/custom-fields', module: 'product-custom-fields', title: 'Urun Ozel Alanlari', primary: 'name', secondary: 'field_type', fields: ['name', 'field_type', 'options'] },
      { path: 'catalog/barcodes', module: 'product-barcode-batches', title: 'Toplu Barkod', primary: 'title', secondary: 'prefix', fields: ['title', 'prefix', 'status', 'settings'] },
      { path: 'catalog/reviews', module: 'product-reviews', title: 'Urun Yorumlari', primary: 'customer_name', secondary: 'status', fields: ['product_id', 'customer_name', 'customer_email', 'rating', 'comment', 'status', 'moderation_note'] },
    ],
  },
  {
    label: 'Fiyat Motoru',
    items: [
      { path: 'pricing/profit-rules', module: 'profit-rules', title: 'Kar Kurallari', primary: 'scope', secondary: 'scope_value', fields: ['scope', 'scope_value', 'profit_rate', 'minimum_profit_amount', 'costs'] },
      { path: 'pricing/bulk-operations', module: 'bulk-price-operations', title: 'Toplu Fiyat Islemleri', primary: 'operation_type', secondary: 'status', fields: ['operation_type', 'value', 'filters', 'status'] },
      { path: 'pricing/calculator', module: 'price-calculations', title: 'Fiyat Hesaplama', primary: 'sale_price', secondary: 'profit_amount', fields: ['product_id', 'base_cost', 'commission_cost', 'tax_cost', 'shipping_cost', 'packaging_cost', 'ad_cost', 'profit_rate', 'minimum_profit_amount'] },
    ],
  },
  {
    label: 'Siparis Is Akisi',
    items: [
      { path: 'workflow/rules', module: 'order-workflow-rules', title: 'Is Akisi Kurallari', primary: 'title', secondary: 'to_status', fields: ['title', 'from_status', 'to_status', 'settings'] },
      { path: 'workflow/notes', module: 'order-notes', title: 'Siparis Notlari', primary: 'note', secondary: 'type', fields: ['order_id', 'type', 'note'] },
      { path: 'workflow/history', module: 'order-operation-histories', title: 'Operasyon Gecmisi', primary: 'event', secondary: 'to_status', fields: ['order_id', 'event', 'from_status', 'to_status', 'payload'] },
    ],
  },
  {
    label: 'Bayi B2B',
    items: [
      { path: 'b2b/groups', module: 'dealer-groups', title: 'Bayi Gruplari', primary: 'name', secondary: 'code', fields: ['name', 'code', 'status', 'settings'] },
      { path: 'b2b/dealers', module: 'dealers', title: 'Bayiler', primary: 'name', secondary: 'email', fields: ['name', 'email', 'phone', 'dealer_group_id', 'discount_rate', 'balance', 'xml_settings'] },
      { path: 'b2b/prices', module: 'dealer-prices', title: 'Bayiye Ozel Fiyat', primary: 'price', secondary: 'product_id', fields: ['dealer_id', 'product_id', 'price'] },
      { path: 'b2b/transactions', module: 'dealer-transactions', title: 'Bayi Tahsilat', primary: 'type', secondary: 'amount', fields: ['dealer_id', 'order_id', 'type', 'amount', 'description'] },
    ],
  },
  {
    label: 'SEO ve Ayarlar',
    items: [
      { path: 'seo/settings', module: 'seo-settings', title: 'SEO Yonetimi', primary: 'title', secondary: 'scope', fields: ['title', 'scope', 'status', 'settings'] },
      { path: 'seo/head-tags', module: 'site-scripts', title: 'Head Etiketleri', primary: 'title', secondary: 'placement', fields: ['title', 'placement', 'status', 'content'] },
      { path: 'seo/sitemap', module: 'sitemap-entries', title: 'Sitemap', primary: 'title', secondary: 'url', fields: ['title', 'url', 'status', 'settings'] },
      { path: 'seo/robots', module: 'robots-rules', title: 'Robots.txt', primary: 'title', secondary: 'directive', fields: ['title', 'directive', 'status', 'content'] },
      { path: 'seo/currencies', module: 'currency-rates', title: 'Doviz Kurlari', primary: 'target_currency', secondary: 'rate', fields: ['base_currency', 'target_currency', 'rate'] },
      { path: 'seo/locations', module: 'locations', title: 'Ulke Il Ilce', primary: 'name', secondary: 'type', fields: ['name', 'code', 'type', 'parent_code'] },
      { path: 'seo/languages', module: 'languages', title: 'Coklu Dil', primary: 'name', secondary: 'code', fields: ['name', 'code', 'is_default', 'is_active'] },
    ],
  },
];

export const modulePages = moduleGroups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
