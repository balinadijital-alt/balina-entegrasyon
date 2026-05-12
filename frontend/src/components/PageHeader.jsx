import { Link, useLocation } from 'react-router-dom';
import { flatNavigation } from '../navigation.js';

const descriptions = {
  'Urunler': 'Katalog hazirlik, pazaryeri uygunlugu, stok ve hizli operasyonlari tek ekrandan yonetin.',
  'Urun Ekleme Sihirbazi': 'Urunu temel bilgilerden pazaryeri hazirligina kadar adim adim eksiksiz olusturun.',
  'Pazaryerine Urun Gonderme Sihirbazi': 'Secilen urunleri pazaryeri kurallari, fiyat ve zorunlu ozellik kontrolleriyle gonderin.',
  'Trendyol Yonetim Merkezi': 'Baglanti, katalog, batch, siparis, iade, soru-cevap ve fatura operasyonlarini tek merkezden izleyin.',
  'Siparis Operasyonu': 'Depo, kargo, muhasebe ve musteri sureclerini durum bazli operasyon panosunda takip edin.',
  'Kargo Yonetimi': 'Kargo hesaplari, etiketler, takip ve iade kodlarini operasyonel akisa baglayin.',
  'Odeme Yonetimi': 'POS hesaplari, odeme durumlari, iade islemleri ve loglari takip edin.',
  'Cari/Fatura': 'Cari hesap, tahsilat, fatura ve muhasebe entegrasyon sureclerini yonetin.',
  'SaaS': 'Paket, abonelik, lisans ve kullanim limitlerini izleyin.',
};

export function PageHeader({ title, actions, description }) {
  const location = useLocation();
  const current = flatNavigation.find((item) => item.to === location.pathname || (item.to !== '/' && location.pathname.startsWith(item.to)));
  const fallbackDescription = description || descriptions[title] || 'Operasyonel kayitlari filtreleyin, durumlari izleyin ve gerekli aksiyonlari hizlica alin.';

  return (
    <div className="page-header">
      <div className="page-title-block">
        <div className="page-mini-breadcrumb">
          <Link to="/">Panel</Link>
          {current && <span>{current.label}</span>}
        </div>
        <h1>{title}</h1>
        <p>{fallbackDescription}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
