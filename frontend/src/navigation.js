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
  FileSearch,
  Gauge,
  HelpCircle,
  Landmark,
  Languages,
  Layers3,
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
import { canAccessNavigationItem, hasPermission } from './auth/permissions.js';

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
      { to: '/catalog/categories', label: 'Kategoriler', icon: Tags, permissions: ['products.manage'] },
      { to: '/catalog/brands', label: 'Markalar', icon: ShieldCheck, permissions: ['products.manage'] },
      { to: '/catalog/attributes', label: 'Nitelikler / Ozellikler', icon: ClipboardCheck, permissions: ['products.manage'] },
      { to: '/marketplace-mapping', label: 'Pazaryeri Eslestirmeleri', icon: Tags, permissions: ['marketplaces.manage'] },
      { to: '/catalog/variants', label: 'Varyantlar', icon: ClipboardCheck, permissions: ['products.manage'] },
      { to: '/catalog/tags', label: 'Etiketler', icon: Percent, permissions: ['products.manage'] },
      { to: '/catalog/suppliers', label: 'Tedarikciler', icon: Building2, permissions: ['products.manage'] },
      { to: '/pricing/profit-rules', label: 'Fiyat Kurallari', icon: Calculator, permissions: ['products.manage'] },
      { to: '/catalog/tax-rates', label: 'KDV Oranlari', icon: Percent, permissions: ['products.manage'] },
      { to: '/catalog/units', label: 'Birimler', icon: Settings, permissions: ['products.manage'] },
      { to: '/catalog/defaults', label: 'KDV / Birim / Desi', icon: Settings, permissions: ['products.manage'] },
      { to: '/pricing/bulk-operations', label: 'Toplu Urun Islemleri', icon: Workflow, permissions: ['products.manage'] },
      { to: '/imports', label: 'Toplu Urun Yukleme', icon: UploadCloud, permissions: ['imports.manage'] },
    ],
  },
  {
    label: 'Entegrasyonlar',
    items: [
      { to: '/marketplaces', label: 'Pazaryeri Entegrasyonlari', icon: Link2, end: true, permissions: ['marketplaces.manage'] },
      { to: '/products/publish-wizard', label: 'Toplu Pazaryeri Islemleri', icon: Send, permissions: ['marketplaces.send'] },
      { to: '/products/publish-queue', label: 'Pazaryeri Monitoru', icon: ClipboardList, permissions: ['marketplaces.send'] },
      { to: '/marketplaces/onboarding', label: 'Kurulum Sihirbazi', icon: Rocket, permissions: ['marketplaces.manage'] },
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
      { to: '/operations', label: 'Operasyon Merkezi', icon: Activity, permissions: ['queue.view', 'logs.view', 'analytics.view'] },
      { to: '/shipping', label: 'Kargo Yonetimi', icon: Truck, permissions: ['shipping.manage'] },
      { to: '/payments', label: 'Odeme Yonetimi', icon: CreditCard, permissions: ['payments.manage'] },
      { to: '/accounting', label: 'Fatura/Cari', icon: Landmark, permissions: ['accounting.manage'] },
      { to: '/queue', label: 'Queue Merkezi', icon: Workflow, permissions: ['queue.view'] },
    ],
  },
  {
    label: 'CMS',
    items: [
      { to: '/cms/pages', label: 'Sayfalar', icon: FileText, permissions: ['modules.manage'] },
      { to: '/cms/blog-posts', label: 'Blog', icon: FileText, permissions: ['modules.manage'] },
      { to: '/cms/blog-categories', label: 'Blog Kategorileri', icon: Tags, permissions: ['modules.manage'] },
      { to: '/cms/banners', label: 'Bannerlar', icon: FileImage, permissions: ['modules.manage'] },
      { to: '/cms/popups', label: 'Popup', icon: Megaphone, permissions: ['modules.manage'] },
      { to: '/cms/menus', label: 'Menu', icon: Menu, permissions: ['modules.manage'] },
      { to: '/cms/faqs', label: 'SSS', icon: HelpCircle, permissions: ['modules.manage'] },
      { to: '/cms/legal', label: 'Sozlesmeler / Cerez', icon: ReceiptText, permissions: ['modules.manage'] },
    ],
  },
  {
    label: 'Pazarlama',
    items: [
      { to: '/marketing/coupons', label: 'Kuponlar', icon: Percent, permissions: ['modules.manage'] },
      { to: '/marketing/coupons', label: 'Sepet Indirimleri', icon: Percent, permissions: ['modules.manage'] },
      { to: '/marketing/abandoned-carts', label: 'Terk Edilmis Sepet', icon: ShoppingBag, permissions: ['modules.manage'] },
      { to: '/marketing/email-templates', label: 'E-posta Sablonlari', icon: Mail, permissions: ['modules.manage'] },
      { to: '/marketing/sms-templates', label: 'SMS Sablonlari', icon: Smartphone, permissions: ['modules.manage'] },
      { to: '/marketing/whatsapp', label: 'WhatsApp Sablonlari', icon: MessageSquare, permissions: ['modules.manage'] },
      { to: '/marketing/feeds', label: 'Merchant / Meta Feed', icon: Megaphone, permissions: ['modules.manage'] },
      { to: '/marketing/pixels', label: 'Pixel Ayarlari', icon: FileCode2, permissions: ['modules.manage'] },
    ],
  },
  {
    label: 'SEO',
    items: [
      { to: '/seo/settings', label: 'Meta Ayarlari', icon: SearchCheck, permissions: ['modules.manage'] },
      { to: '/seo/sitemap', label: 'Sitemap', icon: FileText, permissions: ['modules.manage'] },
      { to: '/seo/robots', label: 'Robots.txt', icon: FileCode2, permissions: ['modules.manage'] },
      { to: '/seo/head-tags', label: 'Search Console / Head Kodlari', icon: ShieldCheck, permissions: ['modules.manage'] },
      { to: '/seo/languages', label: 'Coklu Dil', icon: Languages, permissions: ['modules.manage'] },
      { to: '/seo/locations', label: 'Lokasyonlar', icon: MapPinned, permissions: ['modules.manage'] },
      { to: '/seo/currencies', label: 'Doviz Ayarlari', icon: CircleDollarSign, permissions: ['modules.manage'] },
    ],
  },
  {
    label: 'B2B / Bayi',
    items: [
      { to: '/b2b/groups', label: 'Bayi Gruplari', icon: Building2, permissions: ['modules.manage'] },
      { to: '/b2b/dealers', label: 'Bayi Firmalari', icon: Building2, permissions: ['modules.manage'] },
      { to: '/b2b/prices', label: 'Ozel Fiyatlar', icon: CircleDollarSign, permissions: ['modules.manage'] },
      { to: '/b2b/transactions', label: 'Bakiye / Tahsilat', icon: Landmark, permissions: ['modules.manage'] },
      { to: '/b2b/dealers', label: 'Bayi XML Ayarlari', icon: UploadCloud, permissions: ['modules.manage'] },
    ],
  },
  {
    label: 'Fiyat Motoru',
    items: [
      { to: '/pricing/profit-rules', label: 'Kar Kurallari', icon: Calculator, permissions: ['products.manage'] },
      { to: '/pricing/bulk-operations', label: 'Toplu Fiyat Operasyonlari', icon: Workflow, permissions: ['products.manage'] },
      { to: '/pricing/profit-rules', label: 'Kategori Bazli Fiyatlama', icon: Tags, permissions: ['products.manage'] },
      { to: '/pricing/bulk-operations', label: 'XML Bazli Fiyatlama', icon: UploadCloud, permissions: ['products.manage'] },
      { to: '/pricing/calculator', label: 'Maliyet Dahil Hesaplama', icon: Calculator, permissions: ['products.manage'] },
    ],
  },
  {
    label: 'Siparis Is Akisi',
    items: [
      { to: '/workflow/rules', label: 'Durum Gecis Kurallari', icon: Workflow, permissions: ['modules.manage'] },
      { to: '/workflow/rules', label: 'Kilitli Durumlar', icon: ShieldCheck, permissions: ['modules.manage'] },
      { to: '/workflow/notes', label: 'Siparis Notlari', icon: ClipboardList, permissions: ['modules.manage'] },
      { to: '/workflow/history', label: 'Operasyon Gecmisi', icon: FileText, permissions: ['modules.manage'] },
    ],
  },
  {
    label: 'Katalog Gelismis',
    items: [
      { to: '/catalog/relations', label: 'Urun Iliskileri', icon: Link2, permissions: ['products.manage'] },
      { to: '/catalog/custom-fields', label: 'Urun Ozel Alanlari', icon: ClipboardCheck, permissions: ['products.manage'] },
      { to: '/catalog/barcodes', label: 'Toplu Barkod', icon: FileCode2, permissions: ['products.manage'] },
      { to: '/catalog/reviews', label: 'Urun Yorumlari', icon: MessageSquare, permissions: ['products.manage'] },
    ],
  },
  {
    label: 'Genel',
    items: [
      { to: '/reports', label: 'Raporlar', icon: BarChart3, permissions: ['analytics.view'] },
      { to: '/help-center', label: 'Yardim Merkezi', icon: HelpCircle },
      { to: '/resources', label: 'Kaynaklar', icon: BookOpen },
      { to: '/resources/api-knowledge', label: 'API Knowledge Center', icon: FileSearch },
      { to: '/settings', label: 'Ayarlar', icon: Settings, permissions: ['settings.manage'] },
    ],
  },
];

export const adminNavigationGroups = [
  {
    label: 'Balina Yonetimi',
    items: [
      { to: '/admin', label: 'Dashboard', icon: Gauge, end: true, roles: ['super_admin'] },
      { to: '/admin/executive', label: 'Executive Dashboard', icon: Sparkles, roles: ['super_admin'], permissions: ['executive.view'] },
      { to: '/admin/companies', label: 'Musteri Firmalar', icon: Building2, roles: ['super_admin'], permissions: ['companies.manage'] },
      { to: '/admin/saas', label: 'Paketler Lisanslar', icon: Sparkles, roles: ['super_admin'], permissions: ['saas.manage'] },
      { to: '/admin/saas', label: 'Abonelikler', icon: ClipboardCheck, roles: ['super_admin'], permissions: ['saas.manage'] },
      { to: '/admin/payments', label: 'Odemeler Billing', icon: CircleDollarSign, roles: ['super_admin'], permissions: ['saas.manage'] },
      { to: '/admin/roles', label: 'Roller', icon: ShieldCheck, roles: ['super_admin'], permissions: ['roles.manage'] },
    ],
  },
  {
    label: 'Sistem Operasyonu',
    items: [
      { to: '/admin/reports', label: 'Sistem Sagligi', icon: BarChart3, roles: ['super_admin'], permissions: ['analytics.view'] },
      { to: '/admin/operations', label: 'Operasyon Merkezi', icon: Activity, roles: ['super_admin'] },
      { to: '/admin/queue', label: 'Queue Horizon', icon: Workflow, roles: ['super_admin'], permissions: ['queue.view'] },
      { to: '/admin/api-logs', label: 'API Loglari', icon: FileText, roles: ['super_admin'], permissions: ['logs.view'] },
      { to: '/admin/queue', label: 'Failed Jobs', icon: AlertTriangle, roles: ['super_admin'], permissions: ['queue.view'] },
      { to: '/admin/api-logs', label: 'Audit Log', icon: ShieldCheck, roles: ['super_admin'], permissions: ['logs.view'] },
      { to: '/admin/settings', label: 'Global Ayarlar', icon: Settings, roles: ['super_admin'], permissions: ['settings.manage'] },
    ],
  },
];

export const navigationGroups = appNavigationGroups;
export const flatNavigation = navigationGroups.flatMap((group) => group.items);

export function userHasPermission(user, permission) {
  return hasPermission(user, permission);
}

export function filterNavigationByPermissions(groups, user) {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessNavigationItem(user, item)),
    }))
    .filter((group) => group.items.length > 0);
}
