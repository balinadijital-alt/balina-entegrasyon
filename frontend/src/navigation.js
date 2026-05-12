import {
  AlertTriangle,
  BarChart3,
  Building2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Gauge,
  Landmark,
  Link2,
  Package,
  Percent,
  Settings,
  ShieldCheck,
  Sparkles,
  Truck,
  Workflow,
} from 'lucide-react';

export const appNavigationGroups = [
  {
    label: 'Musteri Paneli',
    items: [
      { to: '/', label: 'Baslangic', icon: Gauge, end: true },
      { to: '/products', label: 'Urunler', icon: Package, end: true },
      { to: '/marketplaces', label: 'Pazaryerleri', icon: Link2, end: true },
      { to: '/orders', label: 'Siparisler', icon: ClipboardList },
      { to: '/shipping', label: 'Kargo', icon: Truck },
      { to: '/accounting', label: 'Faturalar Cari', icon: Landmark },
      { to: '/marketing/coupons', label: 'Kampanyalar', icon: Percent },
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
