import {
  BarChart3,
  Building2,
  ClipboardList,
  FilePenLine,
  CreditCard,
  FileText,
  Gauge,
  Landmark,
  Link2,
  Megaphone,
  Package,
  PackagePlus,
  Percent,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Send,
  Sparkles,
  Store,
  Tags,
  Truck,
  UploadCloud,
  Users,
  Workflow,
} from 'lucide-react';

export const navigationGroups = [
  {
    label: 'Genel',
    items: [
      { to: '/', label: 'Panel', icon: Gauge, end: true },
      { to: '/reports', label: 'Raporlar', icon: BarChart3 },
    ],
  },
  {
    label: 'Katalog',
    items: [
      { to: '/companies', label: 'Firmalar', icon: Building2 },
      { to: '/products', label: 'Urunler', icon: Package, end: true },
      { to: '/products/new', label: 'Urun Ekle', icon: PackagePlus },
      { to: '/products/publish', label: 'Urun Gonder', icon: Send },
      { to: '/catalog/variants', label: 'Varyantlar', icon: Tags },
      { to: '/pricing/profit-rules', label: 'Fiyat Motoru', icon: Percent },
      { to: '/imports', label: 'Import Merkezi', icon: UploadCloud },
    ],
  },
  {
    label: 'Web ve Pazarlama',
    items: [
      { to: '/cms/pages', label: 'CMS Sayfalar', icon: FilePenLine },
      { to: '/cms/blog-posts', label: 'Blog', icon: FileText },
      { to: '/cms/banners', label: 'Banner Popup', icon: Megaphone },
      { to: '/marketing/coupons', label: 'Kuponlar', icon: Percent },
      { to: '/marketing/feeds', label: 'Feed ve Pixel', icon: Megaphone },
    ],
  },
  {
    label: 'Pazaryeri',
    items: [
      { to: '/marketplaces', label: 'Pazaryerleri', icon: Link2, end: true },
      { to: '/marketplaces/trendyol', label: 'Trendyol', icon: Store },
      { to: '/marketplaces/hepsiburada', label: 'Hepsiburada', icon: ShoppingBag },
      { to: '/orders', label: 'Siparisler', icon: ClipboardList },
    ],
  },
  {
    label: 'Operasyon',
    items: [
      { to: '/shipping', label: 'Kargo', icon: Truck },
      { to: '/payments', label: 'Odemeler', icon: CreditCard },
      { to: '/accounting', label: 'Cari/Fatura', icon: Landmark },
      { to: '/workflow/rules', label: 'Siparis Akisi', icon: Workflow },
      { to: '/b2b/dealers', label: 'Bayi B2B', icon: Users },
      { to: '/saas', label: 'SaaS', icon: Sparkles },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/settings', label: 'Ayarlar', icon: Settings },
      { to: '/seo/settings', label: 'SEO', icon: BarChart3 },
      { to: '/api-logs', label: 'API Loglari', icon: FileText },
      { to: '/queue', label: 'Queue', icon: Workflow },
      { to: '/roles', label: 'Roller', icon: ShieldCheck },
    ],
  },
];

export const flatNavigation = navigationGroups.flatMap((group) => group.items);
