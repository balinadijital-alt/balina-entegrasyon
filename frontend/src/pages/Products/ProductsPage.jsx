import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Edit3, Eye, Layers3, MoreHorizontal, PackagePlus, Send, UploadCloud } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { marketplaceStatus, missingFields, productImage, publishBlockReason, readinessScore } from './productWorkflow.js';

const statusLabels = {
  draft: 'Taslak',
  active: 'Aktif',
  passive: 'Pasif',
  ready: 'Hazir',
  not_ready: 'Eksik',
  missing: 'Eksik',
  queued: 'Gonderildi',
  failed: 'Hatali',
  blocked: 'Eksik',
};

function statusLabel(value) {
  return statusLabels[value] || value || '-';
}

function marketplaceLabel(product, code) {
  const status = marketplaceStatus(product, code);
  const value = status?.status || status?.readiness_status;

  return statusLabel(value);
}

function formatPrice(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function ProductsPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [readyFilter, setReadyFilter] = useState('');
  const [missingFilter, setMissingFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [trendyolFilter, setTrendyolFilter] = useState('');
  const [hepsiburadaFilter, setHepsiburadaFilter] = useState('');
  const [marketplaceId, setMarketplaceId] = useState('');
  const [selected, setSelected] = useState([]);
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEdit, setQuickEdit] = useState({ price: '', stock: '', status: 'active' });

  const load = async () => {
    await run(async () => {
      const [productResponse, companyResponse, marketplaceResponse] = await Promise.all([api.products.list(), api.companies.list(), api.marketplaces.list()]);
      setProducts(productResponse.data || []);
      setCompanies(companyResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setMarketplaceId((current) => current || marketplaceResponse.data?.[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSelected = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const startQuickEdit = (product) => {
    setQuickEditId(product.id);
    setQuickEdit({ price: product.price || '', stock: product.stock || 0, status: product.status || 'active' });
  };

  const saveQuickEdit = async (product) => {
    await run(async () => {
      await api.products.update(product.id, {
        ...product,
        price: Number(quickEdit.price),
        stock: Number(quickEdit.stock),
        status: quickEdit.status,
        gallery_images: product.gallery_images || [],
        variant_options: product.variant_options || null,
        trendyol_attributes: product.trendyol_attributes || null,
        hepsiburada_attributes: product.hepsiburada_attributes || null,
      });
      notify('success', 'Urun hizli guncellendi.');
      setQuickEditId(null);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const addToPublishQueue = async (ids) => {
    if (!marketplaceId) {
      notify('error', 'Aktarim listesine eklemek icin pazaryeri hesabi seciniz.');
      return;
    }

    await run(async () => {
      const response = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: ids,
        mappings: {},
        price_controls: { source: 'product-list' },
      });
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Urunler aktarim listesine eklendi, eksikler var.' : 'Urunler aktarim listesine hazir eklendi.');
    }, { onError: (message) => notify('error', message) });
  };

  const sendProducts = async (ids) => {
    if (!marketplaceId) {
      notify('error', 'Gonderim icin pazaryeri hesabi seciniz.');
      return;
    }

    await run(async () => {
      const draft = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: ids,
        mappings: {},
        price_controls: { source: 'product-list-direct-send' },
      });
      if (draft.status === 'blocked') {
        notify('error', 'Eksik kategori/ozellik olan urunler gonderilemez. Aktarim listesinden eksikleri tamamlayin.');
        return;
      }
      await api.productPublish.send(draft.id);
      notify('success', 'Urunler pazaryeri gonderim kuyruguna alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !status || product.status === status;
    const matchesCompany = !companyId || String(product.company_id) === String(companyId);
    const missing = missingFields(product);
    const trendyol = marketplaceStatus(product, 'trendyol')?.status || marketplaceStatus(product, 'trendyol')?.readiness_status || '';
    const hepsiburada = marketplaceStatus(product, 'hepsiburada')?.status || marketplaceStatus(product, 'hepsiburada')?.readiness_status || '';
    const matchesReady = !readyFilter || (readyFilter === 'ready' ? product.marketplace_ready : !product.marketplace_ready);
    const matchesMissing = !missingFilter || missing.includes(missingFilter);
    const matchesStock = !stockFilter || (stockFilter === 'out' ? Number(product.stock || 0) <= 0 : Number(product.stock || 0) <= Number(product.critical_stock || 0));
    const matchesTrendyol = !trendyolFilter || trendyol === trendyolFilter;
    const matchesHepsiburada = !hepsiburadaFilter || hepsiburada === hepsiburadaFilter;
    return matchesSearch && matchesStatus && matchesCompany && matchesReady && matchesMissing && matchesStock && matchesTrendyol && matchesHepsiburada;
  });

  return (
    <>
      <PageHeader
        title="Urunler"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/products/category-mapping"><Layers3 size={16} /> Kategori Esle</Link>
            <Link className="button-link secondary-link" to="/products/publish-queue"><ClipboardList size={16} /> Aktarim Listesi</Link>
            <Link className="button-link secondary-link" to="/products/import"><UploadCloud size={16} /> Toplu Urun Yukle</Link>
            <Link className="button-link" to="/products/new"><PackagePlus size={16} /> Urun Ekle</Link>
          </>
        )}
      />
      <section className="panel compact-filter-panel">
        <div className="compact-filter-heading">
          <strong>Filtreler</strong>
          <span>Urunleri ada, stok durumuna veya pazaryeri hazirligina gore daraltin.</span>
        </div>
        <div className="product-filter-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Urun, SKU veya barkod ara" />
          <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Tum firmalar</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tum durumlar</option>
            <option value="draft">Taslak</option>
            <option value="active">Aktif</option>
            <option value="passive">Pasif</option>
          </select>
          <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
            <option value="">Pazaryeri hesabi</option>
            {marketplaces.map((marketplace) => <option key={marketplace.id} value={marketplace.id}>{marketplace.name}</option>)}
          </select>
          <select value={readyFilter} onChange={(event) => setReadyFilter(event.target.value)}>
            <option value="">Hazirlik durumu</option>
            <option value="ready">Hazir</option>
            <option value="not_ready">Eksik</option>
          </select>
          <select value={missingFilter} onChange={(event) => setMissingFilter(event.target.value)}>
            <option value="">Eksik alan</option>
            <option value="category_mapping">Kategori</option>
            <option value="required_attributes">Ozellik</option>
            <option value="image">Gorsel</option>
            <option value="marketplace_category">Pazaryeri kategori</option>
          </select>
          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="">Stok durumu</option>
            <option value="critical">Kritik stok</option>
            <option value="out">Stok yok</option>
          </select>
          <select value={trendyolFilter} onChange={(event) => setTrendyolFilter(event.target.value)}>
            <option value="">Trendyol</option>
            <option value="ready">Hazir</option>
            <option value="not_ready">Eksik</option>
            <option value="queued">Gonderildi</option>
            <option value="failed">Hatali</option>
          </select>
          <select value={hepsiburadaFilter} onChange={(event) => setHepsiburadaFilter(event.target.value)}>
            <option value="">Hepsiburada</option>
            <option value="ready">Hazir</option>
            <option value="not_ready">Eksik</option>
            <option value="queued">Gonderildi</option>
            <option value="failed">Hatali</option>
          </select>
        </div>
      </section>
      <section className="kpi-grid compact-kpis">
        <div className="kpi-card"><span>Toplam Urun</span><strong>{products.length}</strong><small>Katalog kaydi</small></div>
        <div className="kpi-card"><span>Pazaryerine Hazir</span><strong>{products.filter((product) => product.marketplace_ready).length}</strong><small>Eksiksiz urun</small></div>
        <div className="kpi-card"><span>Eksik Alan</span><strong>{products.filter((product) => !product.marketplace_ready).length}</strong><small>Kontrol gerekli</small></div>
        <div className="kpi-card"><span>Secili</span><strong>{selected.length}</strong><small>Toplu aksiyon</small></div>
      </section>
      {selected.length > 0 && (
        <section className="state-box bulk-action-bar">
          <span>{selected.length} urun secildi.</span>
          <Link className="button-link secondary-link" to="/products/category-mapping"><Layers3 size={16} /> Toplu kategori esle</Link>
          <button type="button" className="secondary-button" disabled={loading} onClick={() => addToPublishQueue(selected)}>Aktarim listesine ekle</button>
          <button type="button" className="secondary-button" onClick={() => notify('success', 'Toplu fiyat/stok guncelleme icin hizli duzenleme alanini kullanin.')}>Fiyat/stok guncelle</button>
          <button type="button" disabled={loading} onClick={() => sendProducts(selected)}><Send size={16} /> Toplu gonder</button>
        </section>
      )}
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={filteredProducts}
          emptyTitle="Urun bulunamadi"
          emptyText="Filtreleri temizleyin, yeni urun ekleyin veya Excel/XML ile toplu yukleme baslatin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} /> },
            { key: 'image', label: 'Gorsel', render: (row) => productImage(row) ? <img className="table-product-image" src={productImage(row)} alt={row.name} /> : <span className="table-product-placeholder"><PackagePlus size={16} /></span> },
            { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span></div> },
            { key: 'stock', label: 'Stok', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.stock} onChange={(event) => setQuickEdit({ ...quickEdit, stock: event.target.value })} /> : <span className={Number(row.stock || 0) <= Number(row.critical_stock || 0) ? 'badge running' : 'badge active'}>{row.stock}</span> },
            { key: 'price', label: 'Fiyat', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.price} onChange={(event) => setQuickEdit({ ...quickEdit, price: event.target.value })} /> : formatPrice(row.price) },
            { key: 'score', label: 'Hazirlik Durumu', render: (row) => <div className="score-cell"><strong>{readinessScore(row)}%</strong><span>{publishBlockReason(row)}</span></div> },
            { key: 'marketplace', label: 'Pazaryeri Durumu', render: (row) => <div className="marketplace-badges"><span className="badge created">TY {marketplaceLabel(row, 'trendyol')}</span><span className="badge created">HB {marketplaceLabel(row, 'hepsiburada')}</span></div> },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => quickEditId === row.id ? (
                <div className="row-actions">
                  <select value={quickEdit.status} onChange={(event) => setQuickEdit({ ...quickEdit, status: event.target.value })}>
                    <option value="draft">Taslak</option>
                    <option value="active">Aktif</option>
                    <option value="passive">Pasif</option>
                  </select>
                  <button type="button" disabled={loading} onClick={() => saveQuickEdit(row)}>Kaydet</button>
                </div>
              ) : (
                <details className="action-menu">
                  <summary><MoreHorizontal size={16} /> Islemler</summary>
                  <div>
                    <Link to={`/products/${row.id}/edit`}><Edit3 size={15} /> Duzenle</Link>
                    <Link to={`/products/${row.id}`}><Eye size={15} /> Detay</Link>
                    <Link to={`/products/category-mapping?category=${encodeURIComponent(row.category || '')}`}><Layers3 size={15} /> Kategori esle</Link>
                    <button type="button" onClick={() => startQuickEdit(row)}>Stok/fiyat duzenle</button>
                    <button type="button" disabled={loading} onClick={() => addToPublishQueue([row.id])}>Aktarima ekle</button>
                    <button type="button" disabled={loading} onClick={() => sendProducts([row.id])}><Send size={15} /> Gonder</button>
                  </div>
                </details>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
