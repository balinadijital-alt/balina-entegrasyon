import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  Building2,
  Calculator,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileImage,
  FileCode2,
  FileText,
  Gauge,
  HelpCircle,
  Landmark,
  Languages,
  Link2,
  Mail,
  MapPinned,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  PackagePlus,
  Percent,
  ReceiptText,
  Rocket,
  SearchCheck,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Smartphone,
  Tags,
  Truck,
  UploadCloud,
  Workflow,
} from 'lucide-react';

export const appNavigationGroups = [
  {
    label: 'Baslangic',
    items: [
      { to: '/', label: 'Baslangic', icon: Gauge, end: true },
      { to: '/executive', label: 'Executive Dashboard', icon: Sparkles, permissions: ['executive.view'] },
    ],
  },
  {
    label: 'Urun Yonetimi',
    items: [
      { to: '/products', label: 'Urun Listesi', icon: Package, end: true, permissions: ['products.manage'] },
      { to: '/products/new', label: 'Urun Ekle', icon: PackagePlus, permissions: ['products.manage'] },
      { to: '/catalog/categories', label: 'Kategoriler', icon: Tags },
      { to: '/catalog/brands', label: 'Markalar', icon: ShieldCheck },
      { to: '/catalog/attributes', label: 'Nitelikler / Ozellikler', icon: ClipboardCheck },
      { to: '/products/category-mapping', label: 'Kategori Eslestirme', icon: Tags },
      { to: '/catalog/variants', label: 'Varyantlar', icon: ClipboardCheck },
      { to: '/catalog/tags', label: 'Etiketler', icon: Percent },
      { to: '/catalog/suppliers', label: 'Tedarikciler', icon: Building2 },
      { to: '/pricing/profit-rules', label: 'Fiyat Kurallari', icon: Calculator },
      { to: '/catalog/tax-rates', label: 'KDV Oranlari', icon: Percent },
      { to: '/catalog/units', label: 'Birimler', icon: Settings },
      { to: '/catalog/defaults', label: 'KDV / Birim / Desi', icon: Settings },
      { to: '/pricing/bulk-operations', label: 'Toplu Urun Islemleri', icon: Workflow },
      { to: '/imports', label: 'Toplu Urun Yukleme', icon: UploadCloud, permissions: ['imports.manage'] },
      { to: '/products/publish-queue', label: 'Aktarim Listesi', icon: Send, permissions: ['marketplaces.send'] },
    ],
  },
  {
    label: 'Pazaryeri Yonetimi',
    items: [
      { to: '/marketplaces', label: 'Pazaryeri Hesaplari', icon: Link2, end: true, permissions: ['marketplaces.manage'] },
      { to: '/marketplaces/onboarding', label: 'Kurulum Sihirbazi', icon: Rocket, permissions: ['marketplaces.manage'] },
      { to: '/products/publish-queue', label: 'Urun Aktarim Listesi', icon: Send, permissions: ['marketplaces.send'] },
      { to: '/marketplaces/trendyol', label: 'Trendyol', icon: ShoppingBag, permissions: ['marketplaces.manage'] },
      { to: '/marketplaces/hepsiburada', label: 'Hepsiburada', icon: ShoppingBag, permissions: ['marketplaces.manage'] },
      { to: '/marketplaces/batch-results', label: 'Batch Sonuclari', icon: ClipboardList, permissions: ['marketplaces.manage'] },
      { to: '/api-logs', label: 'Hata Merkezi', icon: AlertTriangle, permissions: ['logs.view'] },
    ],
  },
  {
    label: 'Siparis Yonetimi',
    items: [
      { to: '/orders', label: 'Tum Siparisler', icon: ClipboardList, end: true, permissions: ['orders.manage'] },
      { to: '/orders/new', label: 'Yeni Siparisler', icon: ClipboardList, permissions: ['orders.manage'] },
      { to: '/orders/preparing', label: 'Hazirlanan Siparisler', icon: ClipboardList, permissions: ['orders.manage'] },
      { to: '/orders/ready-to-ship', label: 'Kargoya Hazir', icon: Truck, permissions: ['orders.manage'] },
      { to: '/orders/shipped', label: 'Kargodaki Siparisler', icon: Truck, permissions: ['orders.manage'] },
      { to: '/orders/cancel-returned', label: 'Iade/Iptal', icon: AlertTriangle, permissions: ['orders.manage'] },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { to: '/operations', label: 'Operasyon Merkezi', icon: Activity },
      { to: '/shipping', label: 'Kargo Yonetimi', icon: Truck, permissions: ['shipping.manage'] },
      { to: '/payments', label: 'Odeme Yonetimi', icon: CreditCard, permissions: ['payments.manage'] },
      { to: '/accounting', label: 'Fatura/Cari', icon: Landmark, permissions: ['accounting.manage'] },
    ],
  },
  {
    label: 'CMS',
    items: [
      { to: '/cms/pages', label: 'Sayfalar', icon: FileText },
      { to: '/cms/blog-posts', label: 'Blog', icon: FileText },
      { to: '/cms/blog-categories', label: 'Blog Kategorileri', icon: Tags },
      { to: '/cms/banners', label: 'Bannerlar', icon: FileImage },
      { to: '/cms/popups', label: 'Popup', icon: Megaphone },
      { to: '/cms/menus', label: 'Menu', icon: Menu },
      { to: '/cms/faqs', label: 'SSS', icon: HelpCircle },
      { to: '/cms/legal', label: 'Sozlesmeler / Cerez', icon: ReceiptText },
    ],
  },
  {
    label: 'Pazarlama',
    items: [
      { to: '/marketing/coupons', label: 'Kuponlar', icon: Percent },
      { to: '/marketing/coupons', label: 'Sepet Indirimleri', icon: Percent },
      { to: '/marketing/abandoned-carts', label: 'Terk Edilmis Sepet', icon: ShoppingBag },
      { to: '/marketing/email-templates', label: 'E-posta Sablonlari', icon: Mail },
      { to: '/marketing/sms-templates', label: 'SMS Sablonlari', icon: Smartphone },
      { to: '/marketing/whatsapp', label: 'WhatsApp Sablonlari', icon: MessageSquare },
      { to: '/marketing/feeds', label: 'Merchant / Meta Feed', icon: Megaphone },
      { to: '/marketing/pixels', label: 'Pixel Ayarlari', icon: FileCode2 },
    ],
  },
  {
    label: 'SEO',
    items: [
      { to: '/seo/settings', label: 'Meta Ayarlari', icon: SearchCheck },
      { to: '/seo/sitemap', label: 'Sitemap', icon: FileText },
      { to: '/seo/robots', label: 'Robots.txt', icon: FileCode2 },
      { to: '/seo/head-tags', label: 'Search Console / Head Kodlari', icon: ShieldCheck },
      { to: '/seo/languages', label: 'Coklu Dil', icon: Languages },
      { to: '/seo/locations', label: 'Lokasyonlar', icon: MapPinned },
      { to: '/seo/currencies', label: 'Doviz Ayarlari', icon: CircleDollarSign },
    ],
  },
  {
    label: 'B2B / Bayi',
    items: [
      { to: '/b2b/groups', label: 'Bayi Gruplari', icon: Building2 },
      { to: '/b2b/dealers', label: 'Bayi Firmalari', icon: Building2 },
      { to: '/b2b/prices', label: 'Ozel Fiyatlar', icon: CircleDollarSign },
      { to: '/b2b/transactions', label: 'Bakiye / Tahsilat', icon: Landmark },
      { to: '/b2b/dealers', label: 'Bayi XML Ayarlari', icon: UploadCloud },
    ],
  },
  {
    label: 'Fiyat Motoru',
    items: [
      { to: '/pricing/profit-rules', label: 'Kar Kurallari', icon: Calculator },
      { to: '/pricing/bulk-operations', label: 'Toplu Fiyat Operasyonlari', icon: Workflow },
      { to: '/pricing/profit-rules', label: 'Kategori Bazli Fiyatlama', icon: Tags },
      { to: '/pricing/bulk-operations', label: 'XML Bazli Fiyatlama', icon: UploadCloud },
      { to: '/pricing/calculator', label: 'Maliyet Dahil Hesaplama', icon: Calculator },
    ],
  },
  {
    label: 'Siparis Is Akisi',
    items: [
      { to: '/workflow/rules', label: 'Durum Gecis Kurallari', icon: Workflow },
      { to: '/workflow/rules', label: 'Kilitli Durumlar', icon: ShieldCheck },
      { to: '/workflow/notes', label: 'Siparis Notlari', icon: ClipboardList },
      { to: '/workflow/history', label: 'Operasyon Gecmisi', icon: FileText },
    ],
  },
  {
    label: 'Katalog Gelismis',
    items: [
      { to: '/catalog/relations', label: 'Urun Iliskileri', icon: Link2 },
      { to: '/catalog/custom-fields', label: 'Urun Ozel Alanlari', icon: ClipboardCheck },
      { to: '/catalog/barcodes', label: 'Toplu Barkod', icon: FileCode2 },
      { to: '/catalog/reviews', label: 'Urun Yorumlari', icon: MessageSquare },
    ],
  },
  {
    label: 'Genel',
    items: [
      { to: '/reports', label: 'Raporlar', icon: BarChart3, permissions: ['analytics.view'] },
      { to: '/help-center', label: 'Yardim Merkezi', icon: HelpCircle },
      { to: '/resources', label: 'Kaynaklar', icon: BookOpen },
      { to: '/settings', label: 'Ayarlar', icon: Settings, permissions: ['settings.manage'] },
    ],
  },
];

export const adminNavigationGroups = [
  {
    label: 'Balina Yonetimi',
    items: [
      { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
      { to: '/admin/executive', label: 'Executive Dashboard', icon: Sparkles, permissions: ['executive.view'] },
      { to: '/admin/companies', label: 'Musteri Firmalar', icon: Building2, permissions: ['companies.manage'] },
      { to: '/admin/saas', label: 'Paketler Lisanslar', icon: Sparkles, permissions: ['saas.manage'] },
      { to: '/admin/saas', label: 'Abonelikler', icon: ClipboardCheck, permissions: ['saas.manage'] },
      { to: '/admin/payments', label: 'Odemeler Billing', icon: CircleDollarSign, permissions: ['saas.manage'] },
    ],
  },
  {
    label: 'Sistem Operasyonu',
    items: [
      { to: '/admin/reports', label: 'Sistem Sagligi', icon: BarChart3, permissions: ['analytics.view'] },
      { to: '/admin/operations', label: 'Operasyon Merkezi', icon: Activity },
      { to: '/admin/queue', label: 'Queue Horizon', icon: Workflow, permissions: ['queue.view'] },
      { to: '/admin/api-logs', label: 'API Loglari', icon: FileText, permissions: ['logs.view'] },
      { to: '/admin/queue', label: 'Failed Jobs', icon: AlertTriangle, permissions: ['queue.view'] },
      { to: '/admin/api-logs', label: 'Audit Log', icon: ShieldCheck, permissions: ['logs.view'] },
      { to: '/admin/settings', label: 'Global Ayarlar', icon: Settings, permissions: ['settings.manage'] },
    ],
  },
];

export const navigationGroups = appNavigationGroups;
export const flatNavigation = navigationGroups.flatMap((group) => group.items);

const defaultRolePermissions = {
  super_admin: ['*'],
  company_admin: [
    'companies.manage', 'users.manage', 'roles.manage', 'settings.manage', 'products.manage', 'imports.manage',
    'marketplaces.manage', 'marketplaces.send', 'orders.manage', 'payments.manage', 'payments.refund',
    'shipping.manage', 'shipping.labels', 'accounting.manage', 'queue.view', 'queue.retry',
    'analytics.view', 'executive.view', 'logs.view', 'modules.manage',
  ],
  operator: ['products.manage', 'imports.manage', 'marketplaces.manage', 'marketplaces.send', 'orders.manage', 'queue.view', 'queue.retry', 'analytics.view', 'logs.view'],
  company_operator: ['products.manage', 'imports.manage', 'marketplaces.manage', 'marketplaces.send', 'orders.manage', 'queue.view', 'queue.retry', 'analytics.view', 'logs.view'],
  finance: ['payments.manage', 'payments.refund', 'accounting.manage', 'analytics.view', 'logs.view'],
  warehouse: ['shipping.manage', 'shipping.labels', 'orders.manage', 'analytics.view'],
  support: ['analytics.view', 'logs.view', 'queue.view'],
};

export function userHasPermission(user, permission) {
  if (!permission) return true;

  const roleNames = user?.roles?.map((role) => role.name) || [];
  if (roleNames.includes('super_admin')) return true;

  const directPermissions = new Set(user?.permissions?.map((item) => item.name) || []);
  if (directPermissions.has(permission)) return true;

  return roleNames.some((role) => (defaultRolePermissions[role] || []).includes(permission));
}

export function filterNavigationByPermissions(groups, user) {
  if (!user) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !item.permissions || item.permissions.some((permission) => userHasPermission(user, permission))),
    }))
    .filter((group) => group.items.length > 0);
}
