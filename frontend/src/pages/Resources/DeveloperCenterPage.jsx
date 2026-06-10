import { useMemo, useState } from 'react';
import {
  BellRing,
  BookOpen,
  Boxes,
  CheckCircle2,
  CreditCard,
  FileJson2,
  FileSpreadsheet,
  FileText,
  Gauge,
  Link2,
  Search,
  ServerCog,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ResourceCard } from '../../components/ResourceCard.jsx';
import { Link } from 'react-router-dom';

const categories = [
  'Tum kaynaklar',
  'Pazaryeri',
  'Kargo',
  'Odeme',
  'E-fatura',
  'Import',
  'Webhook',
  'Platform API',
  'Ortam',
];

const resources = [
  {
    title: 'Trendyol Developer Dokumanlari',
    category: 'Pazaryeri',
    environment: 'Test / Canli',
    status: 'Dis kaynak',
    statusTone: 'created',
    icon: ShoppingBag,
    description: 'Kategori, marka, urun aktarimi, stok/fiyat ve siparis servisleri icin resmi Trendyol kaynaklari.',
    links: [
      { label: 'Developer Portal', href: 'https://developers.trendyol.com/' },
      { label: 'Urun Entegrasyonu', href: 'https://developers.trendyol.com/docs/marketplace/urun-entegrasyonu' },
    ],
  },
  {
    title: 'Hepsiburada Entegrasyon Notlari',
    category: 'Pazaryeri',
    environment: 'Canli',
    status: 'Kontrol listesi',
    statusTone: 'running',
    icon: Boxes,
    description: 'Merchant bilgileri, kategori yapisi, urun dosyasi, siparis ve kargo surecleri icin operasyon notlari.',
    links: [
      { label: 'Entegrator Bilgileri', href: 'https://developers.hepsiburada.com/' },
    ],
  },
  {
    title: 'Kargo Entegrasyon Kaynaklari',
    category: 'Kargo',
    environment: 'Operasyon',
    status: 'Rehber',
    statusTone: 'active',
    icon: Truck,
    description: 'Kargo hesabi, etiket olusturma, takip numarasi ve iade kodu akislarinda kullanilacak temel kaynaklar.',
    links: [
      { label: 'Kargo Yonetimi', href: '/shipping' },
    ],
  },
  {
    title: 'POS ve Odeme Saglayici Kaynaklari',
    category: 'Odeme',
    environment: 'Test / Canli',
    status: 'Guvenlik',
    statusTone: 'created',
    icon: CreditCard,
    description: '3D Secure, provizyon, iade ve odeme hesabi baglama sureclerinde dikkat edilmesi gereken alanlar.',
    links: [
      { label: 'Odeme Yonetimi', href: '/payments' },
    ],
  },
  {
    title: 'E-fatura ve E-arsiv Kaynaklari',
    category: 'E-fatura',
    environment: 'Canli',
    status: 'Operasyon',
    statusTone: 'active',
    icon: FileText,
    description: 'Fatura kesme, PDF indirme, cari hesap ve muhasebe aktarimi icin kullanilan operasyon rehberi.',
    links: [
      { label: 'Fatura/Cari', href: '/accounting' },
    ],
  },
  {
    title: 'XML ve Excel Import Rehberi',
    category: 'Import',
    environment: 'Toplu islem',
    status: 'Hazirlik',
    statusTone: 'running',
    icon: FileSpreadsheet,
    description: 'Alan eslestirme, tedarikci XML kaynagi, fiyat/stok guncelleme ve yukleme sonucu kontrol adimlari.',
    links: [
      { label: 'Toplu Urun Yukleme', href: '/products/import' },
      { label: 'Import Merkezi', href: '/imports' },
    ],
  },
  {
    title: 'Webhook Rehberleri',
    category: 'Webhook',
    environment: 'Gercek zamanli',
    status: 'Planlandi',
    statusTone: 'blocked',
    icon: BellRing,
    description: 'Siparis, stok, fiyat, fatura ve kargo olaylarini dis sistemlere bildirmek icin kullanilacak olay rehberi.',
    links: [
      { label: 'Ayarlar', href: '/settings' },
    ],
  },
  {
    title: 'API Limitleri ve Rate Limit',
    category: 'Platform API',
    environment: 'Limit',
    status: 'Kritik',
    statusTone: 'failed',
    icon: Gauge,
    description: 'Pazaryeri ve platform istek limitleri, toplu aktarim araliklari ve hata tekrar stratejileri.',
    links: [
      { label: 'Hata Merkezi', href: '/api-logs' },
    ],
  },
  {
    title: 'Test ve Canli Ortam Ayrimi',
    category: 'Ortam',
    environment: 'Test / Canli',
    status: 'Zorunlu',
    statusTone: 'active',
    icon: ShieldCheck,
    description: 'API anahtarlarini, tedarikci hesaplarini ve pazaryeri ortam secimini karistirmadan yonetme rehberi.',
    links: [
      { label: 'Pazaryerleri', href: '/marketplaces' },
    ],
  },
];

const endpointCards = [
  { method: 'GET', path: '/api/products', label: 'Urun listesi', tone: 'active' },
  { method: 'POST', path: '/api/marketplace-publish/validate', label: 'Aktarim kontrolu', tone: 'running' },
  { method: 'GET', path: '/api/orders', label: 'Siparisler', tone: 'created' },
  { method: 'POST', path: '/api/products/import', label: 'Toplu urun yukleme', tone: 'blocked' },
];

const checklist = [
  'Firma bilgileri tamamlandi',
  'Pazaryeri hesabi baglandi',
  'Kategori ve nitelik eslesti',
  'Test ortaminda aktarim denendi',
  'Canli ortam anahtarlari kontrol edildi',
  'Hata Merkezi izleme akisi belirlendi',
];

export function DeveloperCenterPage() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Tum kaynaklar');

  const filteredResources = useMemo(() => resources.filter((resource) => {
    const query = search.trim().toLowerCase();
    const matchesCategory = category === 'Tum kaynaklar' || resource.category === category;
    const matchesSearch = !query || [resource.title, resource.description, resource.category, resource.environment].some((value) => value.toLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  }), [search, category]);

  return (
    <>
      <PageHeader
        title="Kaynaklar / Developer Center"
        description="Pazaryeri, kargo, odeme, e-fatura, import ve platform API surecleri icin operasyon ekiplerinin kullanacagi bilgi merkezi."
        actions={<Link className="button-link" to="/resources/api-knowledge"><ServerCog size={16} /> API Knowledge Center</Link>}
      />

      <section className="developer-hero panel">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Entegrasyon Bilgi Merkezi</span>
          <h2>Dokuman, kontrol listesi ve sik kullanilan endpointler tek yerde.</h2>
          <p>Bu alan genel kaynak girisidir. Endpoint, servis, queue ve readiness iliskileri icin yeni API Knowledge Center'i kullanin.</p>
        </div>
        <div className="developer-hero-stats">
          <div><strong>{resources.length}</strong><span>kaynak karti</span></div>
          <div><strong>{endpointCards.length}</strong><span>endpoint ozeti</span></div>
          <div><strong>6</strong><span>kontrol adimi</span></div>
        </div>
      </section>

      <section className="panel resource-filter-panel">
        <div className="resource-search">
          <Search size={18} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kaynak, endpoint veya kategori ara" />
        </div>
        <div className="resource-category-tabs">
          {categories.map((item) => (
            <button type="button" className={item === category ? 'active' : ''} onClick={() => setCategory(item)} key={item}>
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="resource-grid">
        {filteredResources.length === 0 ? (
          <div className="panel empty-state resource-empty">
            <BookOpen size={28} />
            <strong>Kaynak bulunamadi</strong>
            <span>Arama metnini veya kategori filtresini temizleyerek tekrar deneyin.</span>
          </div>
        ) : filteredResources.map((resource) => <ResourceCard resource={resource} key={resource.title} />)}
      </section>

      <section className="developer-lower-grid">
        <div className="panel">
          <div className="section-title-row">
            <h2>Sik Kullanilan Endpointler</h2>
            <span className="badge active"><ServerCog size={13} /> Platform API</span>
          </div>
          <div className="endpoint-list">
            {endpointCards.map((endpoint) => (
              <div className="endpoint-card" key={endpoint.path}>
                <span className={`badge ${endpoint.tone}`}>{endpoint.method}</span>
                <strong>{endpoint.path}</strong>
                <small>{endpoint.label}</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="section-title-row">
            <h2>Entegrasyon Durum Checklist'i</h2>
            <span className="badge created"><CheckCircle2 size={13} /> Hazirlik</span>
          </div>
          <div className="developer-checklist">
            {checklist.map((item, index) => (
              <label className="check-row" key={item}>
                <input type="checkbox" defaultChecked={index < 3} />
                {item}
              </label>
            ))}
          </div>
        </div>

        <div className="panel guide-card">
          <FileJson2 size={24} />
          <strong>API Knowledge Center</strong>
          <span>Trendyol endpoint matrisi, kullanildigi ekranlar, queue iliskileri ve readiness etkileri yeni merkezde toplandi.</span>
          <Link to="/resources/api-knowledge">Bilgi merkezini ac</Link>
        </div>

        <div className="panel guide-card">
          <Link2 size={24} />
          <strong>Dis kaynak linkleri</strong>
          <span>Resmi dokuman linkleri kartlarda ayrildi. Icerik statik tutuldugu icin backend degisikligi gerektirmez.</span>
          <a href="/marketplaces">Pazaryeri hesaplarini ac</a>
        </div>
      </section>
    </>
  );
}
