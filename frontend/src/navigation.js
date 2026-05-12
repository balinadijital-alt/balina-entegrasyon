import {
  AlertTriangle,
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FilePenLine,
  FileText,
  Gauge,
  Landmark,
  Link2,
  Megaphone,
  Package,
  PackagePlus,
  Percent,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Tags,
  Truck,
  UploadCloud,
  Users,
  Workflow,
} from 'lucide-react';

export const appNavigationGroups = [
  {
    label: 'E-Ticaret Yonetimi',
    items: [
      { to: '/', label: 'Dashboard', icon: Gauge, end: true },
      { to: '/products', label: 'Urunler', icon: Package, end: true },
      { to: '/products/new', label: 'Urun Ekle', icon: PackagePlus },
      { to: '/products/import', label: 'Toplu Urun Yukleme', icon: UploadCloud },
      { to: '/catalog/variants', label: 'Varyantlar', icon: Tags },
      { to: '/catalog/relations', label: 'Urun Iliskileri', icon: Link2 },
      { to: '/pricing/profit-rules', label: 'Fiyat Motoru', icon: Percent },
      { to: '/orders', label: 'Siparisler', icon: ClipboardList },
      { to: '/shipping', label: 'Kargo', icon: Truck },
      { to: '/payments', label: 'Odemeler', icon: CreditCard },
      { to: '/accounting', label: 'Faturalar Cari', icon: Landmark },
      { to: '/marketing/coupons', label: 'Kampanyalar Kuponlar', icon: Percent },
      { to: '/cms/pages', label: 'Sayfalar', icon: FilePenLine },
      { to: '/cms/blog-posts', label: 'Blog', icon: FileText },
      { to: '/cms/banners', label: 'Bannerlar', icon: Megaphone },
      { to: '/seo/settings', label: 'SEO Ayarlari', icon: BarChart3 },
      { to: '/b2b/dealers', label: 'Bayi B2B', icon: Users },
    ],
  },
  {
    label: 'Pazaryeri Operasyon Merkezi',
    items: [
      { to: '/reports', label: 'Pazaryeri Dashboard', icon: BarChart3 },
      { to: '/marketplaces', label: 'Pazaryeri Hesaplari', icon: Link2, end: true },
      { to: '/products/category-mapping', label: 'Kategori Eslestirme', icon: Tags },
      { to: '/products/publish-queue', label: 'Pazaryeri Aktarim', icon: ClipboardCheck },
      { to: '/marketplaces/trendyol', label: 'Trendyol Yonetimi', icon: Store },
      { to: '/marketplaces/hepsiburada', label: 'Hepsiburada Yonetimi', icon: ShoppingBag },
      { to: '/products/publish', label: 'Senkronizasyon', icon: Send },
      { to: '/products/publish-queue', label: 'Batch Sonuclari', icon: Workflow },
      { to: '/api-logs', label: 'API Loglari', icon: FileText },
      { to: '/api-logs', label: 'Hata Merkezi', icon: AlertTriangle },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/saas', label: 'SaaS Abonelik', icon: Sparkles },
      { to: '/roles', label: 'Kullanicilar Roller', icon: ShieldCheck },
      { to: '/queue', label: 'Queue Horizon Durumu', icon: Workflow },
      { to: '/settings', label: 'Ayarlar', icon: Settings },
      { to: '/companies', label: 'Firmalar', icon: Building2 },
      { to: '/payments', label: 'POS Ayarlari', icon: CircleDollarSign },
    ],
  },
];

export const adminNavigationGroups = [
  {
    label: 'Balina Yonetimi',
    items: [
      { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
      { to: '/admin/companies', label: 'Musteri Firmalar', icon: Building2 },
      { to: '/admin/saas', label: 'Paketler Lisanslar', icon: Sparkles },
      { to: '/admin/saas', label: 'Abonelikler', icon: ClipboardCheck },
      { to: '/admin/payments', label: 'Odemeler Billing', icon: CircleDollarSign },
    ],
  },
  {
    label: 'Sistem Operasyonu',
    items: [
      { to: '/admin/reports', label: 'Sistem Sagligi', icon: BarChart3 },
      { to: '/admin/queue', label: 'Queue Horizon', icon: Workflow },
      { to: '/admin/api-logs', label: 'API Loglari', icon: FileText },
      { to: '/admin/queue', label: 'Failed Jobs', icon: AlertTriangle },
      { to: '/admin/api-logs', label: 'Audit Log', icon: ShieldCheck },
      { to: '/admin/settings', label: 'Global Ayarlar', icon: Settings },
    ],
  },
];

export const navigationGroups = appNavigationGroups;
export const flatNavigation = navigationGroups.flatMap((group) => group.items);
