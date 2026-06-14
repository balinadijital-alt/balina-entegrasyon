import { CheckCircle2 } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

const sectionConfig = {
  products: {
    tabs: [
      { label: 'Urun Yonetimi', to: '/products' },
      { label: 'Kategori Yonetimi', to: '/catalog/categories' },
      { label: 'Marka Yonetimi', to: '/catalog/brands' },
      { label: 'Nitelik Yonetimi', to: '/catalog/attributes' },
      { label: 'Varyant Yonetimi', to: '/catalog/variants' },
      { label: 'Pazaryeri Eslestirmeleri', to: '/marketplace-mapping' },
      { label: 'Toplu Pazaryeri Islemleri', to: '/products/publish-wizard' },
    ],
    note: 'Urun, kategori, marka ve pazaryeri hazirlik islemleri referans paneldeki gibi ust sekmelerden yonetilir.',
    next: 'Siradaki islem: eksik urun bilgilerini tamamlayip pazaryeri eslestirmesine gecin.',
  },
  marketplace: {
    tabs: [
      { label: 'Pazaryeri Entegrasyonlari', to: '/marketplaces' },
      { label: 'Pazaryeri Eslestirmeleri', to: '/marketplace-mapping' },
      { label: 'Toplu Pazaryeri Islemleri', to: '/products/publish-wizard' },
      { label: 'Hepsiburada Islemleri', to: '/marketplaces/hepsiburada' },
      { label: 'Pazaryeri Monitoru', to: '/products/publish-queue' },
    ],
    note: 'Magaza baglama, eslestirme, urun gonderme ve hata takibi ayni akisin parcalari olarak gorunur.',
    next: 'Siradaki islem: once magaza baglayin, sonra kategori ve nitelik eslestirmelerini tamamlayin.',
  },
  orders: {
    tabs: [
      { label: 'Tum Siparisler', to: '/orders' },
      { label: 'Yeni Siparisler', to: '/orders/new' },
      { label: 'Hazirlananlar', to: '/orders/preparing' },
      { label: 'Kargoya Hazir', to: '/orders/ready-to-ship' },
      { label: 'Kargodaki Siparisler', to: '/orders/shipped' },
      { label: 'Iade / Iptal', to: '/orders/cancel-returned' },
    ],
    note: 'Siparis akisi durum sekmeleriyle takip edilir; secilen kaydin detay ve aksiyonlari sag panelde gorunur.',
    next: 'Siradaki islem: yeni siparisleri hazirlamaya alin veya kargoya hazir kayitlari etiketleyin.',
  },
  imports: {
    tabs: [
      { label: 'XML / Excel Import', to: '/imports' },
      { label: 'Urun Yukleme', to: '/products/import' },
      { label: 'Alan Eslestirme', to: '/imports#mapping' },
      { label: 'Import Gecmisi', to: '/imports#history' },
      { label: 'Hata Merkezi', to: '/api-logs' },
    ],
    note: 'Kaynak secimi, alan eslestirme, onizleme ve import sonucu tek operasyon akisi olarak izlenir.',
    next: 'Siradaki islem: kaynak dosya veya XML adresini secip zorunlu alan eslestirmelerini tamamlayin.',
  },
  operations: {
    tabs: [
      { label: 'Operasyon Merkezi', to: '/operations' },
      { label: 'Queue Merkezi', to: '/queue' },
      { label: 'Hata Merkezi', to: '/api-logs' },
      { label: 'Kargo Yonetimi', to: '/shipping' },
      { label: 'Odeme Yonetimi', to: '/payments' },
      { label: 'Fatura / Cari', to: '/accounting' },
    ],
    note: 'Sistem sagligi, kuyruklar, API hatalari ve operasyonel aksiyonlar ayni ust akistan takip edilir.',
    next: 'Siradaki islem: hata veya bekleyen is varsa ilgili detay panelinden aksiyon alin.',
  },
  finance: {
    tabs: [
      { label: 'Odeme Yonetimi', to: '/payments' },
      { label: 'Fatura / Cari', to: '/accounting' },
      { label: 'Raporlar', to: '/reports' },
      { label: 'Hata Merkezi', to: '/api-logs' },
    ],
    note: 'Odeme, iade, tahsilat, cari ve fatura kayitlari finans operasyonu icinde ayrilir.',
    next: 'Siradaki islem: bekleyen odeme veya fatura kaydini secip detaydan durumu kontrol edin.',
  },
  resources: {
    tabs: [
      { label: 'Kaynaklar', to: '/resources' },
      { label: 'API Knowledge Center', to: '/resources/api-knowledge' },
      { label: 'Yardim Merkezi', to: '/help-center' },
      { label: 'Raporlar', to: '/reports' },
    ],
    note: 'Yardim, API dokumani ve operasyon bilgisi birbirinden ayrilir; teknik bilgi merkezden bulunur.',
    next: 'Siradaki islem: aradiginiz entegrasyon basligini secip kullanildigi ekranlari kontrol edin.',
  },
  commerce: {
    tabs: [
      { label: 'CMS Sayfalari', to: '/cms/pages' },
      { label: 'Banner / Popup', to: '/cms/banners' },
      { label: 'Kuponlar', to: '/marketing/coupons' },
      { label: 'Feed / Pixel', to: '/marketing/feeds' },
      { label: 'SEO Ayarlari', to: '/seo/settings' },
      { label: 'B2B / Bayi', to: '/b2b/dealers' },
      { label: 'Fiyat Motoru', to: '/pricing/profit-rules' },
    ],
    note: 'Icerik, pazarlama, SEO, B2B ve fiyat motoru referans paneldeki gibi ust sekmelerle ayrilir.',
    next: 'Siradaki islem: duzenlemek istediginiz modulu secip tablo veya form alanindan kaydi guncelleyin.',
  },
  saas: {
    tabs: [
      { label: 'Paketler', to: '/admin/saas' },
      { label: 'Firmalar', to: '/admin/companies' },
      { label: 'Roller', to: '/admin/roles' },
      { label: 'Odemeler', to: '/admin/payments' },
      { label: 'Sistem Sagligi', to: '/admin/reports' },
      { label: 'API Loglari', to: '/admin/api-logs' },
    ],
    note: 'Paket, firma, rol ve odeme kontrolleri super admin operasyon akisi icinde izlenir.',
    next: 'Siradaki islem: firma veya paket kaydini secip lisans ve kullanim durumunu kontrol edin.',
  },
  admin: {
    tabs: [
      { label: 'Musteri Firmalar', to: '/admin/companies' },
      { label: 'Paketler Lisanslar', to: '/admin/saas' },
      { label: 'Sistem Sagligi', to: '/admin/reports' },
      { label: 'Operasyon Merkezi', to: '/admin/operations' },
      { label: 'API Loglari', to: '/admin/api-logs' },
      { label: 'Ayarlar', to: '/admin/settings' },
    ],
    note: 'Super admin alaninda firma, paket, sistem ve hata takibi ayni yonetim akisi altinda gorunur.',
    next: 'Siradaki islem: sorunlu firma, paket veya sistem kaydini ilgili sekmeden inceleyin.',
  },
};

function normalize(path) {
  return path.startsWith('/app') ? path.replace(/^\/app/, '') || '/' : path;
}

export function ReferenceModuleNav({ section, note, next }) {
  const location = useLocation();
  const config = sectionConfig[section];

  if (!config) {
    return null;
  }

  const path = normalize(location.pathname);

  return (
    <>
      <nav className="reference-tabs" aria-label="Referans panel modulleri">
        {config.tabs.map((tab) => {
          const isHash = tab.to.includes('#');
          const targetPath = tab.to.split('#')[0];
          const active = path === targetPath || (targetPath !== '/' && path.startsWith(`${targetPath}/`));

          return isHash ? (
            <a key={tab.label} href={tab.to} className={active ? 'active' : undefined}>
              {tab.label}
            </a>
          ) : (
            <Link key={tab.label} to={tab.to} className={active ? 'active' : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <div className="reference-info-strip">
        <CheckCircle2 size={18} />
        <div>
          <strong>{note || config.note}</strong>
          <span>{next || config.next}</span>
        </div>
      </div>
    </>
  );
}
