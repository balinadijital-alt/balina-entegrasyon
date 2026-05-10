import {
  BarChart3,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  Landmark,
  Link2,
  Package,
  PackagePlus,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  UploadCloud,
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
      { to: '/imports', label: 'Import Merkezi', icon: UploadCloud },
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
      { to: '/saas', label: 'SaaS', icon: Sparkles },
    ],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/settings', label: 'Ayarlar', icon: Settings },
      { to: '/api-logs', label: 'API Loglari', icon: FileText },
      { to: '/queue', label: 'Queue', icon: Workflow },
      { to: '/roles', label: 'Roller', icon: ShieldCheck },
    ],
  },
];

export const flatNavigation = navigationGroups.flatMap((group) => group.items);
