import { Link, useLocation } from 'react-router-dom';
import { flatNavigation } from '../navigation.js';

const descriptions = {
  'Baslangic': 'Kurulumu tamamlayin, pazaryerlerini baglayin ve gunluk satis operasyonunu tek ekrandan takip edin.',
  'Urunler': 'Katalog hazirlik, pazaryeri uygunlugu, stok ve hizli operasyonlari tek ekrandan yonetin.',
  'Urun Ekleme Sihirbazi': 'Urunu temel bilgilerden pazaryeri hazirligina kadar adim adim eksiksiz olusturun.',
  'Urun Duzenleme Sihirbazi': 'Mevcut urunu ayni wizard akisiyle guncelleyip kayit oncesi readiness kontrolunu calistirin.',
  'Urun Detay': 'Urun bilgileri, pazaryeri hazirligi, gonderim gecmisi ve API hatalarini tek detay ekraninda izleyin.',
  'Kategori Eslestirme': 'Yerel kategorileri pazaryeri kategori agaci ve zorunlu ozelliklerle sablon olarak eslestirin.',
  'Pazaryeri Aktarim Listesi': 'Urunleri once aktarim listesine alip eksik kategori, ozellik, gorsel ve fiyat kontrollerini tamamlayin.',
  'Pazaryerine Urun Gonderme Sihirbazi': 'Secilen urunleri pazaryeri kurallari, fiyat ve zorunlu ozellik kontrolleriyle gonderin.',
  'Trendyol Yonetim Merkezi': 'Baglanti, urun aktarimi, stok/fiyat, siparis, iade, soru-cevap ve fatura islemlerini tek merkezden izleyin.',
  'Siparis Operasyonu': 'Depo, kargo, muhasebe ve musteri sureclerini durum bazli operasyon panosunda takip edin.',
  'Kargo Yonetimi': 'Kargo hesaplari, etiketler, takip ve iade kodlarini operasyonel akisa baglayin.',
  'Odeme Yonetimi': 'POS hesaplari, odeme durumlari, iade islemleri ve loglari takip edin.',
  'Cari/Fatura': 'Cari hesap, tahsilat, fatura ve muhasebe entegrasyon sureclerini yonetin.',
  'Cari ve Fatura Yonetimi': 'Fatura, cari hesap ve tahsilat islemlerini siparis operasyonuyla birlikte takip edin.',
  'Pazaryerleri': 'Trendyol ve Hepsiburada hesaplarinizi baglayin, kategori ve urun aktarimlarini yonetin.',
  'Hepsiburada Entegrasyonu': 'Hepsiburada hesap bilgilerini kaydedin, urun, stok/fiyat ve siparis islemlerini baslatin.',
  'Hata Merkezi': 'Pazaryeri islemlerinde aksiyon gerektiren hata ve uyari kayitlarini kontrol edin.',
  'Toplu Urun Yukleme': 'Excel veya XML ile urunlerinizi yukleyin, alanlari eslestirin ve yukleme sonucunu takip edin.',
  'Kupon ve Kampanyalar': 'Pazaryeri ve magaza kampanyalarinizi planlayip takip edin.',
  'SaaS': 'Paket, abonelik, lisans ve kullanim limitlerini izleyin.',
};

export function PageHeader({ title, actions, description }) {
  const location = useLocation();
  const normalizedPath = location.pathname.startsWith('/app') ? location.pathname.replace(/^\/app/, '') || '/' : location.pathname;
  const current = flatNavigation
    .filter((item) => item.to === normalizedPath || (item.to !== '/' && normalizedPath.startsWith(item.to)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const fallbackDescription = description || descriptions[title] || 'Operasyonel kayitlari filtreleyin, durumlari izleyin ve gerekli aksiyonlari hizlica alin.';
  const homePath = location.pathname.startsWith('/app') ? '/app' : '/';

  return (
    <div className="page-header">
      <div className="page-title-block">
        <div className="page-mini-breadcrumb">
          <Link to={homePath}>Panel</Link>
          {current && <span>{current.label}</span>}
        </div>
        <h1>{title}</h1>
        <p>{fallbackDescription}</p>
      </div>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
