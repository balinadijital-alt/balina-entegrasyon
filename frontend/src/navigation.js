import {
  AlertTriangle,
  BarChart3,
  Building2,
  Calculator,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileImage,
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
    ],
  },
  {
    label: 'Urun Yonetimi',
    items: [
      { to: '/products', label: 'Urun Listesi', icon: Package, end: true },
      { to: '/products/new', label: 'Urun Ekle', icon: PackagePlus },
      { to: '/products/import', label: 'Toplu Urun Yukleme', icon: UploadCloud },
      { to: '/products/category-mapping', label: 'Kategori Eslestirme', icon: Tags },
      { to: '/catalog/variants', label: 'Varyant Yonetimi', icon: ClipboardCheck },
      { to: '/pricing/profit-rules', label: 'Fiyat Kurallari', icon: Calculator },
    ],
  },
  {
    label: 'Pazaryeri Yonetimi',
    items: [
      { to: '/marketplaces', label: 'Pazaryeri Hesaplari', icon: Link2, end: true },
      { to: '/products/publish-queue', label: 'Urun Aktarim Listesi', icon: Send },
      { to: '/marketplaces/trendyol', label: 'Trendyol', icon: ShoppingBag },
      { to: '/marketplaces/hepsiburada', label: 'Hepsiburada', icon: ShoppingBag },
      { to: '/marketplaces/batch-results', label: 'Batch Sonuclari', icon: ClipboardList },
      { to: '/api-logs', label: 'Hata Merkezi', icon: AlertTriangle },
    ],
  },
  {
    label: 'Siparis Yonetimi',
    items: [
      { to: '/orders', label: 'Tum Siparisler', icon: ClipboardList, end: true },
      { to: '/orders/new', label: 'Yeni Siparisler', icon: ClipboardList },
      { to: '/orders/preparing', label: 'Hazirlanan Siparisler', icon: ClipboardList },
      { to: '/orders/ready-to-ship', label: 'Kargoya Hazir', icon: Truck },
      { to: '/orders/shipped', label: 'Kargodaki Siparisler', icon: Truck },
      { to: '/orders/cancel-returned', label: 'Iade/Iptal', icon: AlertTriangle },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { to: '/shipping', label: 'Kargo Yonetimi', icon: Truck },
      { to: '/payments', label: 'Odeme Yonetimi', icon: CreditCard },
      { to: '/accounting', label: 'Fatura/Cari', icon: Landmark },
    ],
  },
  {
    label: 'Web ve Pazarlama',
    items: [
      { to: '/marketing/coupons', label: 'Kampanyalar', icon: Percent },
      { to: '/marketing/coupons', label: 'Kuponlar', icon: Percent },
      { to: '/cms/banners', label: 'Banner/Popup', icon: FileImage },
      { to: '/cms/pages', label: 'Blog/Sayfalar', icon: FileText },
      { to: '/marketing/feeds', label: 'Feed ve Pixel', icon: Megaphone },
    ],
  },
  {
    label: 'Genel',
    items: [
      { to: '/reports', label: 'Raporlar', icon: BarChart3 },
      { to: '/settings', label: 'Ayarlar', icon: Settings },
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
