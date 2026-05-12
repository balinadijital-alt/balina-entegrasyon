import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, ClipboardList, Layers3, Link2, PackagePlus, RefreshCcw, Send, ShoppingBag, Truck, UploadCloud } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const setupSteps = [
  { key: 'company', title: 'Firma bilgilerini tamamla', text: 'Fatura, kargo ve pazaryeri islemleri icin firma bilgilerini kontrol edin.', to: '/app/settings' },
  { key: 'marketplace', title: 'Pazaryeri hesabi bagla', text: 'Trendyol veya Hepsiburada hesap bilgilerinizi ekleyin.', to: '/app/marketplaces' },
  { key: 'mapping', title: 'Kategori eslestirme yap', text: 'Kendi kategorilerinizi pazaryeri kategorileriyle eslestirin.', to: '/app/products/category-mapping' },
  { key: 'products', title: 'Urun ekle veya toplu yukle', text: 'Urunleri tek tek ekleyin veya Excel/XML ile toplu yukleyin.', to: '/app/products/new' },
  { key: 'queue', title: 'Urunleri aktarim listesine ekle', text: 'Hazir urunleri pazaryerine gondermeden once listeye alin.', to: '/app/products/publish-queue' },
  { key: 'sync', title: 'Stok/fiyat senkronunu baslat', text: 'Fiyat ve stok bilgilerinin pazaryerlerinde guncellenmesini saglayin.', to: '/app/products/publish' },
  { key: 'orders', title: 'Siparisleri takip et', text: 'Yeni siparisleri, kargo ve fatura sureclerini izleyin.', to: '/app/orders' },
];

function statusCount(report, group, keys) {
  return (report?.breakdowns[group] || [])
    .filter((item) => keys.includes(item.label))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function todayOrders(report) {
  const series = report?.charts?.orders || [];
  const last = series[series.length - 1];

  return Number(last?.value || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function CustomerDashboardPage() {
  const { loading, error, run } = useAsync();
  const [report, setReport] = useState(null);
  const [marketplaces, setMarketplaces] = useState([]);
  const [products, setProducts] = useState([]);

  const load = async () => {
    await run(async () => {
      const [dashboardResponse, marketplaceResponse, productResponse] = await Promise.all([
        api.dashboard.report(),
        api.marketplaces.list(),
        api.products.list(),
      ]);
      setReport(dashboardResponse);
      setMarketplaces(marketplaceResponse.data || []);
      setProducts(productResponse.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const failedLogs = report?.recent_activity.logs.filter((log) => Number(log.status_code || 0) >= 400) || [];
  const readyProducts = products.filter((product) => product.marketplace_ready).length;
  const missingProducts = Math.max(0, products.length - readyProducts);
  const lowStockProducts = products.filter((product) => Number(product.stock || 0) <= Number(product.critical_stock || 0)).length;
  const completedSteps = {
    company: report?.empty_states.company_count > 0,
    marketplace: marketplaces.length > 0,
    mapping: products.some((product) => product.marketplace_ready),
    products: products.length > 0,
    queue: readyProducts > 0,
    sync: report?.recent_activity.logs.length > 0,
    orders: report?.empty_states.order_count > 0,
  };
  const setupProgress = useMemo(() => {
    const completed = Object.values(completedSteps).filter(Boolean).length;

    return Math.round((completed / setupSteps.length) * 100);
  }, [completedSteps]);

  return (
    <>
      <PageHeader
        title="Baslangic"
        description="Satis operasyonuna baslamak icin firma, pazaryeri, kategori ve urun adimlarini tamamlayin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}

      {report && (
        <>
          <section className="customer-hero">
            <div>
              <span className="eyebrow">Kurulum durumu</span>
              <h2>Panelinizi satisa hazir hale getirin.</h2>
              <p>Asagidaki adimlar tamamlandikca urun aktarimi, stok/fiyat guncelleme ve siparis operasyonu daha sorunsuz ilerler.</p>
            </div>
            <div className="setup-progress">
              <strong>{setupProgress}%</strong>
              <span>kurulum tamamlandi</span>
              <div className="progress"><span style={{ width: `${setupProgress}%` }} /></div>
            </div>
          </section>

          <section className="customer-kpis">
            <div className="kpi-card"><span>Bugunku Siparis</span><strong>{todayOrders(report)}</strong><small>Bugun gelen siparis</small></div>
            <div className="kpi-card"><span>Bekleyen Siparis</span><strong>{statusCount(report, 'orders', ['new', 'pending', 'processing'])}</strong><small>Kontrol edilmeli</small></div>
            <div className="kpi-card"><span>Hazirlanacak Kargo</span><strong>{statusCount(report, 'shipping', ['queued', 'created']) || statusCount(report, 'orders', ['ready_to_ship'])}</strong><small>Etiket/kargo bekliyor</small></div>
            <div className="kpi-card"><span>Pazaryeri Hatalari</span><strong>{failedLogs.length}</strong><small>Hata merkezi</small></div>
            <div className="kpi-card"><span>Stok Uyarilari</span><strong>{lowStockProducts}</strong><small>Kritik stok veya stok yok</small></div>
            <div className="kpi-card"><span>Hazir / Eksik Urun</span><strong>{readyProducts}/{missingProducts}</strong><small>Pazaryeri hazirligi</small></div>
          </section>

          <section className="onboarding-grid">
            <div className="panel compact-panel">
              <h2>Ilk Kurulum Checklist</h2>
              {setupSteps.map((step, index) => (
                <Link className={`onboarding-step ${completedSteps[step.key] ? 'completed' : ''}`} to={step.to} key={step.key}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  {completedSteps[step.key] ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </Link>
              ))}
            </div>

            <div className="panel compact-panel">
              <h2>Pazaryeri Baglantilari</h2>
              <Link className="marketplace-connect-card" to="/app/marketplaces/trendyol"><Link2 size={18} /><strong>Trendyol bagla</strong><span>{marketplaces.some((item) => item.code === 'trendyol') ? 'Baglanti kaydi var' : 'Hesap ekle'}</span></Link>
              <Link className="marketplace-connect-card" to="/app/marketplaces/hepsiburada"><ShoppingBag size={18} /><strong>Hepsiburada bagla</strong><span>{marketplaces.some((item) => item.code === 'hepsiburada') ? 'Baglanti kaydi var' : 'Hesap ekle'}</span></Link>
              <div className="marketplace-connect-card disabled"><AlertTriangle size={18} /><strong>Ciceksepeti</strong><span>Yakinda</span></div>
            </div>
          </section>

          {products.length === 0 && (
            <section className="panel customer-empty-guide">
              <PackagePlus size={28} />
              <div>
                <h2>Ilk urununuzu ekleyin</h2>
                <p>Tek urun ekleyerek baslayabilir veya Excel/XML ile toplu katalog yukleyebilirsiniz. Urunler hazir oldugunda aktarim listesine alinabilir.</p>
              </div>
              <Link className="button-link" to="/app/products/new">Urun ekle</Link>
            </section>
          )}

          <section className="quick-actions-panel">
            <Link to="/app/products/new"><PackagePlus size={18} /> Urun ekle</Link>
            <Link to="/app/products/import"><UploadCloud size={18} /> Toplu urun yukle</Link>
            <Link to="/app/products/category-mapping"><Layers3 size={18} /> Kategori eslestir</Link>
            <Link to="/app/products/publish-queue"><Send size={18} /> Aktarim listesi</Link>
            <Link to="/app/orders"><ClipboardList size={18} /> Siparisleri kontrol et</Link>
            <Link to="/app/shipping"><Truck size={18} /> Kargolari hazirla</Link>
          </section>

          <section className="panel">
            <h2>Son Siparisler</h2>
            <DataTable
              rows={report.recent_activity.orders}
              emptyTitle="Henuz siparis yok"
              emptyText="Pazaryeri baglantisini tamamlayip siparisleri senkronize ettiginizde burada gorunur."
              columns={[
                { key: 'marketplace_order_id', label: 'Siparis No' },
                { key: 'customer_name', label: 'Musteri' },
                { key: 'total_amount', label: 'Tutar', render: (row) => formatMoney(row.total_amount) },
                { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{row.status}</span> },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
