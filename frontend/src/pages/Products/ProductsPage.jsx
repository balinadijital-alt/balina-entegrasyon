import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Edit3, Eye, Layers3, MoreHorizontal, PackagePlus, Send, UploadCloud } from 'lucide-react';
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
  queued: 'Hazirlandi',
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

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function variantSummary(product) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  const childCount = product.variants_count ?? variants.length;
  const totalStock = variants.reduce((sum, variant) => sum + Number(variant.stock || 0), 0);
  const prices = variants.map((variant) => Number(variant.price || 0)).filter((price) => price > 0);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  return { childCount, totalStock, minPrice, maxPrice };
}

function variantBadge(product) {
  if (product.product_type === 'parent') return 'Parent';
  if (product.parent_product_id || product.product_type === 'variant') return 'Variant';
  return null;
}

function rollupStatusLabel(status) {
  return {
    not_ready: 'Eksik',
    ready: 'Hazir',
    queued: 'Kuyrukta',
    partial: 'Kismi',
    failed: 'Hatali',
    rejected: 'Reddedildi',
    approved: 'Onayli',
    mixed: 'Karma',
  }[status] || status || '-';
}

function rollupStatusClass(status) {
  if (status === 'ready' || status === 'approved') return 'active';
  if (status === 'queued' || status === 'partial') return 'running';
  if (status === 'failed' || status === 'rejected') return 'failed';
  return 'draft';
}

function parentReadinessText(product) {
  const rollup = product.variant_readiness_rollup;
  if (!rollup) return null;
  return `${rollup.ready_children || 0}/${rollup.total_children || 0} hazir`;
}

function parentMarketplaceSummary(product, code) {
  const rollup = product.variant_marketplace_status_rollup?.[code];
  if (!rollup) return null;

  const problemCount = Number(rollup.failed_children || 0) + Number(rollup.rejected_children || 0);
  const batchId = rollup.last_batch_request_id ? String(rollup.last_batch_request_id).slice(0, 12) : null;

  return { rollup, problemCount, batchId };
}

function criticalMarketplace(product) {
  const entries = ['trendyol', 'hepsiburada']
    .map((code) => ({ code, summary: parentMarketplaceSummary(product, code) }))
    .filter((item) => item.summary);

  return entries.sort((a, b) => b.summary.problemCount - a.summary.problemCount)[0];
}

export function ProductsPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], brands: [], suppliers: [], tags: [] });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [readyFilter, setReadyFilter] = useState('');
  const [missingFilter, setMissingFilter] = useState('');
  const [stockFilter, setStockFilter] = useState('');
  const [trendyolFilter, setTrendyolFilter] = useState('');
  const [hepsiburadaFilter, setHepsiburadaFilter] = useState('');
  const [marketplaceId, setMarketplaceId] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [selected, setSelected] = useState([]);
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEdit, setQuickEdit] = useState({ price: '', stock: '', status: 'active' });
  const [bulkEdit, setBulkEdit] = useState({ category: '', brand: '', tag: '', price: '', stock: '' });

  const load = async () => {
    await run(async () => {
      const [productResponse, companyResponse, marketplaceResponse, categories, brands, suppliers, tags] = await Promise.all([
        api.products.list(),
        api.companies.list(),
        api.marketplaces.list(),
        api.catalogResources.list({ type: 'categories', active: 1 }),
        api.catalogResources.list({ type: 'brands', active: 1 }),
        api.catalogResources.list({ type: 'suppliers', active: 1 }),
        api.catalogResources.list({ type: 'tags', active: 1 }),
      ]);
      setProducts(productResponse.data || []);
      setCompanies(companyResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setCatalog({
        categories: categories.data || [],
        brands: brands.data || [],
        suppliers: suppliers.data || [],
        tags: tags.data || [],
      });
      setMarketplaceId((current) => current || marketplaceResponse.data?.[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSelected = (id) => {
    const product = products.find((item) => item.id === id);
    if (product?.product_type === 'parent') return;
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

  const productPayload = (product, changes = {}) => ({
    ...product,
    ...changes,
    gallery_images: product.gallery_images || [],
    variant_options: product.variant_options || null,
    trendyol_attributes: product.trendyol_attributes || null,
    hepsiburada_attributes: product.hepsiburada_attributes || null,
    tags: changes.tags || product.tags || [],
    attributes: changes.attributes || product.attributes || {},
  });

  const applyBulkEdit = async () => {
    const selectedProducts = products.filter((product) => selected.includes(product.id));
    if (selectedProducts.length === 0) return;

    await run(async () => {
      await Promise.all(selectedProducts.map((product) => {
        const tags = bulkEdit.tag ? Array.from(new Set([...(product.tags || []), bulkEdit.tag])) : product.tags || [];
        const changes = {
          category: bulkEdit.category || product.category,
          brand: bulkEdit.brand || product.brand,
          tags,
          price: bulkEdit.price === '' ? product.price : Number(bulkEdit.price),
          stock: bulkEdit.stock === '' ? product.stock : Number(bulkEdit.stock),
        };
        return api.products.update(product.id, productPayload(product, changes));
      }));
      notify('success', 'Secili urunler guncellendi.');
      setSelected([]);
      setBulkEdit({ category: '', brand: '', tag: '', price: '', stock: '' });
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
      notify('error', 'Aktarim hazirligi icin pazaryeri hesabi seciniz.');
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
        notify('error', 'Eksik kategori/ozellik olan urunler provider gonderimine hazirlanamaz. Aktarim listesinden eksikleri tamamlayin.');
        return;
      }
      await api.productPublish.send(draft.id);
      notify('success', 'Urunler provider gonderimine hazirlandi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.sku, product.barcode, product.parent?.sku].some((value) => String(value || '').toLowerCase().includes(query));
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
    const matchesCategory = !categoryFilter || product.category === categoryFilter;
    const matchesBrand = !brandFilter || product.brand === brandFilter;
    const matchesSupplier = !supplierFilter || product.supplier_name === supplierFilter;
    const matchesTag = !tagFilter || (product.tags || []).includes(tagFilter);
    return matchesSearch && matchesStatus && matchesCompany && matchesReady && matchesMissing && matchesStock && matchesTrendyol && matchesHepsiburada && matchesCategory && matchesBrand && matchesSupplier && matchesTag;
  });

  return (
    <>
      <PageHeader
        title="Urunler"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/marketplace-mapping/categories"><Layers3 size={16} /> Kategori Esle</Link>
            <Link className="button-link secondary-link" to="/products/publish-queue"><ClipboardList size={16} /> Gonderim Kuyrugu</Link>
            <Link className="button-link secondary-link" to="/products/import"><UploadCloud size={16} /> Toplu Urun Yukle</Link>
            <Link className="button-link" to="/products/new"><PackagePlus size={16} /> Urun Ekle</Link>
          </>
        )}
      />
      <section className="reference-tabs">
        {['Urun Yonetimi', 'Kategori Yonetimi', 'Marka Yonetimi', 'Nitelik Yonetimi', 'Pazaryeri Eslestirmeleri', 'Toplu Pazaryeri Islemleri'].map((item) => (
          <Link
            className={item === 'Urun Yonetimi' ? 'active' : ''}
            to={item === 'Kategori Yonetimi' ? '/catalog/categories' : item === 'Marka Yonetimi' ? '/catalog/brands' : item === 'Nitelik Yonetimi' ? '/catalog/attributes' : item === 'Pazaryeri Eslestirmeleri' ? '/marketplace-mapping' : item === 'Toplu Pazaryeri Islemleri' ? '/products/publish-wizard' : '/products'}
            key={item}
          >
            {item}
          </Link>
        ))}
      </section>
      <section className="reference-info-strip">
        <CheckCircle2 size={18} />
        <div>
          <strong>Ürün yönetiminde ürünlerinizi arayabilir, eksik kategori/marka/nitelik durumlarını görüp pazaryeri işlemine gönderebilirsiniz.</strong>
          <span>Referans paneldeki gibi ürün listesi ana çalışma alanıdır; eşleştirme ve toplu gönderim üst sekmelerden devam eder.</span>
        </div>
      </section>
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
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="">Tum kategoriler</option>
            {catalog.categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
          </select>
          <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
            <option value="">Tum markalar</option>
            {catalog.brands.map((brand) => <option key={brand.id} value={brand.name}>{brand.name}</option>)}
          </select>
          <select value={supplierFilter} onChange={(event) => setSupplierFilter(event.target.value)}>
            <option value="">Tum tedarikciler</option>
            {catalog.suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
          </select>
          <select value={tagFilter} onChange={(event) => setTagFilter(event.target.value)}>
            <option value="">Tum etiketler</option>
            {catalog.tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
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
            <option value="queued">Hazirlandi</option>
            <option value="failed">Hatali</option>
          </select>
          <select value={hepsiburadaFilter} onChange={(event) => setHepsiburadaFilter(event.target.value)}>
            <option value="">Hepsiburada</option>
            <option value="ready">Hazir</option>
            <option value="not_ready">Eksik</option>
            <option value="queued">Hazirlandi</option>
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
          <select value={bulkEdit.category} onChange={(event) => setBulkEdit({ ...bulkEdit, category: event.target.value })}>
            <option value="">Kategori degistir</option>
            {catalog.categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
          </select>
          <select value={bulkEdit.brand} onChange={(event) => setBulkEdit({ ...bulkEdit, brand: event.target.value })}>
            <option value="">Marka degistir</option>
            {catalog.brands.map((brand) => <option key={brand.id} value={brand.name}>{brand.name}</option>)}
          </select>
          <select value={bulkEdit.tag} onChange={(event) => setBulkEdit({ ...bulkEdit, tag: event.target.value })}>
            <option value="">Etiket ekle</option>
            {catalog.tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}
          </select>
          <input type="number" value={bulkEdit.price} onChange={(event) => setBulkEdit({ ...bulkEdit, price: event.target.value })} placeholder="Yeni fiyat" />
          <input type="number" value={bulkEdit.stock} onChange={(event) => setBulkEdit({ ...bulkEdit, stock: event.target.value })} placeholder="Yeni stok" />
          <button type="button" className="secondary-button" disabled={loading} onClick={applyBulkEdit}>Toplu guncelle</button>
          <Link className="button-link secondary-link" to="/marketplace-mapping/categories"><Layers3 size={16} /> Kategori esle</Link>
          <button type="button" className="secondary-button" disabled={loading} onClick={() => addToPublishQueue(selected)}>Aktarim listesine ekle</button>
          <button type="button" disabled={loading} onClick={() => sendProducts(selected)}><Send size={16} /> Toplu Hazirla</button>
        </section>
      )}
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={filteredProducts}
          emptyTitle="Urun bulunamadi"
          emptyText="Filtreleri temizleyin, yeni urun ekleyin veya Excel/XML ile toplu yukleme baslatin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" title={row.product_type === 'parent' ? 'Parent urun gonderilmez; gonderim child varyantlar uzerinden yapilir.' : undefined} disabled={row.product_type === 'parent'} checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} /> },
            { key: 'image', label: 'Gorsel', render: (row) => productImage(row) ? <img className="table-product-image" src={productImage(row)} alt={row.name} /> : <span className="table-product-placeholder"><PackagePlus size={16} /></span> },
            { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span>{variantBadge(row) ? <small className={`variant-badge ${row.product_type === 'parent' ? 'parent' : 'child'}`}>{variantBadge(row)}</small> : null}</div> },
            { key: 'xml_source', label: 'XML Kaynak', render: (row) => <div className="table-product-title"><strong>{row.xml_source?.name || '-'}</strong><span>{row.source_product_code || row.supplier_name || '-'}</span><small>{formatDateTime(row.last_xml_sync_at)}</small></div> },
            {
              key: 'variant',
              label: 'Varyant',
              render: (row) => {
                const summary = variantSummary(row);
                if (row.product_type === 'parent') {
                  return <div className="table-product-title"><strong>{summary.childCount} child</strong><span>Toplam stok {summary.totalStock}</span><small>{summary.minPrice === null ? '-' : `${formatPrice(summary.minPrice)} - ${formatPrice(summary.maxPrice)}`}</small></div>;
                }
                if (row.parent_product_id || row.parent) {
                  return <div className="table-product-title"><strong>{row.parent?.sku || `Parent #${row.parent_product_id}`}</strong><span>{row.variant_group_key || row.variant_group || '-'}</span></div>;
                }
                return '-';
              },
            },
            { key: 'stock', label: 'Stok', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.stock} onChange={(event) => setQuickEdit({ ...quickEdit, stock: event.target.value })} /> : <span className={Number(row.stock || 0) <= Number(row.critical_stock || 0) ? 'badge running' : 'badge active'}>{row.stock}</span> },
            { key: 'price', label: 'Fiyat', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.price} onChange={(event) => setQuickEdit({ ...quickEdit, price: event.target.value })} /> : formatPrice(row.price) },
            { key: 'score', label: 'Hazirlik Durumu', render: (row) => row.product_type === 'parent' && row.variant_readiness_rollup ? <div className="score-cell"><strong>{row.variant_readiness_rollup.readiness_score || 0}%</strong><span>{parentReadinessText(row)}</span></div> : <div className="score-cell"><strong>{readinessScore(row)}%</strong><span>{publishBlockReason(row)}</span></div> },
            {
              key: 'marketplace',
              label: 'Pazaryeri Durumu',
              render: (row) => {
                if (row.product_type === 'parent' && row.variant_marketplace_status_rollup) {
                  const trendyol = parentMarketplaceSummary(row, 'trendyol');
                  const hepsiburada = parentMarketplaceSummary(row, 'hepsiburada');
                  const problemCount = Number(trendyol?.problemCount || 0) + Number(hepsiburada?.problemCount || 0);
                  const batchId = trendyol?.batchId || hepsiburada?.batchId;
                  const critical = criticalMarketplace(row);

                  return (
                    <div className="table-product-title">
                      <div className="marketplace-badges">
                        <span className={`badge ${rollupStatusClass(trendyol?.rollup.rollup_status)}`}>TY {rollupStatusLabel(trendyol?.rollup.rollup_status)}</span>
                        <span className={`badge ${rollupStatusClass(hepsiburada?.rollup.rollup_status)}`}>HB {rollupStatusLabel(hepsiburada?.rollup.rollup_status)}</span>
                      </div>
                      <span>{problemCount > 0 ? `${problemCount} problemli varyant` : 'Problemli varyant yok'}{critical?.summary.problemCount > 0 ? ` / kritik: ${critical.code}` : ''}</span>
                      <span>{batchId ? `Son batch ${batchId}` : 'Batch yok'}</span>
                      <small>Parent urun gonderilmez; child varyantlari kontrol edin.</small>
                      <Link className="table-action-link" to={`/products/${row.id}`}>{problemCount > 0 ? 'Problem coz' : 'Detayi ac'}</Link>
                    </div>
                  );
                }

                return <div className="marketplace-badges"><span className="badge created">TY {marketplaceLabel(row, 'trendyol')}</span><span className="badge created">HB {marketplaceLabel(row, 'hepsiburada')}</span></div>;
              },
            },
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
                    <Link to={`/marketplace-mapping/categories?category=${encodeURIComponent(row.category || '')}`}><Layers3 size={15} /> Kategori esle</Link>
                    <button type="button" onClick={() => startQuickEdit(row)}>Stok/fiyat duzenle</button>
                    <button type="button" disabled={loading || row.product_type === 'parent'} onClick={() => addToPublishQueue([row.id])}>Aktarima ekle</button>
                    <button type="button" disabled={loading || row.product_type === 'parent'} onClick={() => sendProducts([row.id])}><Send size={15} /> Hazirla</button>
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
