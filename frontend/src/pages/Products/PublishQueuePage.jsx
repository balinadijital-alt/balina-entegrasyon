import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Edit3, Layers3, Send, Tags } from 'lucide-react';
import { api } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { isMarketplaceReady, missingLabel, publishBlockReason, readinessScore } from './productWorkflow.js';

function draftMissingText(draft) {
  const missing = draftMissingFields(draft)
    .map((field) => `${missingLabel(field)} eksik`);

  return [...new Set(missing)].join(', ');
}

function draftMissingFields(draft) {
  return Object.values(draft.readiness_report || {})
    .flatMap((report) => report?.missing_fields || [])
    .filter(Boolean);
}

function draftStatusLabel(draft) {
  if (draft.status === 'ready') return 'Hazir';
  if (draft.status === 'blocked') {
    const missing = draftMissingFields(draft);
    if (missing.includes('category_mapping')) return 'Eksik kategori';
    if (missing.includes('required_attributes')) return 'Eksik ozellik';
    if (missing.includes('attributes')) return 'Eksik katalog niteligi';
    if (missing.includes('image')) return 'Eksik gorsel';
    if (missing.includes('price') || missing.includes('stock')) return 'Fiyat/stok hatasi';
    return 'Hata aldi';
  }
  if (draft.status === 'queued') return 'Hazirlandi';
  return draft.status;
}

function productReadinessSummary(product, marketplaceCode) {
  if (product.product_type === 'parent' && product.variant_readiness_rollup) {
    const marketplace = product.variant_readiness_rollup.marketplaces?.[marketplaceCode] || product.variant_readiness_rollup;
    return {
      score: marketplace.readiness_score || 0,
      reason: `Parent aggregate / ${marketplace.ready_children || 0}/${marketplace.total_children || 0} varyant hazir`,
    };
  }

  return {
    score: readinessScore(product, marketplaceCode),
    reason: product.parent ? `${product.parent.name || product.parent.sku} / ${product.variant_group_key || '-'}` : publishBlockReason(product, marketplaceCode),
  };
}

function fixTarget(product, missing = [], marketplaceCode = '') {
  if (missing.includes('category_mapping') || missing.includes('marketplace_category')) {
    return { href: `/products/category-mapping?category=${encodeURIComponent(product?.category || '')}`, label: 'Kategori esle' };
  }
  if (missing.includes('brand')) {
    return { href: '/catalog/brands', label: 'Marka katalogu' };
  }
  if (missing.includes('attributes') || missing.includes('required_attributes')) {
    return { href: '/catalog/attributes', label: 'Nitelik tamamla' };
  }
  if (missing.includes('image')) {
    return { href: `/products/${product?.id}/edit`, label: 'Gorsel duzenle' };
  }
  if (missing.includes('price') || missing.includes('stock')) {
    return { href: `/products/${product?.id}/edit`, label: 'Fiyat/stok duzenle' };
  }
  if (marketplaceCode === 'trendyol' || marketplaceCode === 'hepsiburada') {
    return { href: `/marketplaces/${marketplaceCode}`, label: 'Provider ekrani' };
  }

  return { href: '/api-logs', label: 'API loglari' };
}

export function PublishQueuePage() {
  const { notify, user } = useApp();
  const { loading, error, run } = useAsync();
  const [drafts, setDrafts] = useState([]);
  const [products, setProducts] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [previewDraft, setPreviewDraft] = useState(null);
  const [activeQueueTab, setActiveQueueTab] = useState('ready');

  const selectedMarketplace = useMemo(() => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)), [marketplaces, marketplaceId]);
  const filteredDrafts = drafts.filter((draft) => !marketplaceFilter || draft.marketplace_code === marketplaceFilter);
  const readyDrafts = filteredDrafts.filter((draft) => ['ready', 'queued'].includes(draft.status));
  const blockedDrafts = filteredDrafts.filter((draft) => !['ready', 'queued'].includes(draft.status));
  const visibleDrafts = activeQueueTab === 'ready' ? readyDrafts : blockedDrafts;
  const selectedMarketplaceCode = selectedMarketplace?.code || '';
  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');

  const load = async () => {
    await run(async () => {
      const [draftResponse, productResponse, marketplaceResponse] = await Promise.all([
        api.productPublish.drafts(),
        api.products.list(),
        api.marketplaces.list(),
      ]);
      setDrafts(draftResponse.data || []);
      setProducts(productResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setMarketplaceId((current) => current || marketplaceResponse.data?.[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleProduct = (id) => {
    const product = products.find((item) => item.id === id);
    if (product?.product_type === 'parent') return;
    setSelectedProducts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleDraft = (id) => {
    setSelectedDrafts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const createDraft = async () => {
    if (!canSendMarketplaces) return;
    if (!marketplaceId || selectedProducts.length === 0) {
      notify('error', 'Aktarim listesi icin pazaryeri ve urun secimi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: selectedProducts,
        mappings: {},
        price_controls: { source: 'publish-queue' },
      });
      setPreviewDraft(response);
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Aktarim listesine eklendi, eksikler var.' : 'Aktarim listesine hazir eklendi.');
      setSelectedProducts([]);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendDraft = async (draftId) => {
    if (!canSendMarketplaces) return;
    await run(async () => {
      const response = await api.productPublish.send(draftId);
      setPreviewDraft(response);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Provider gonderimine hazirlandi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendSelectedDrafts = async () => {
    const readyIds = selectedDrafts.filter((draftId) => readyDrafts.some((draft) => draft.id === draftId));
    await Promise.all(readyIds.map((draftId) => sendDraft(draftId)));
    setSelectedDrafts([]);
  };

  const productById = (id) => products.find((product) => Number(product.id) === Number(id));
  const firstDraftProduct = (draft) => productById(draft.product_ids?.[0]);

  return (
    <>
      <PageHeader
        title="Pazaryeri Aktarim Listesi"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/products/category-mapping"><Layers3 size={16} /> Kategori Esle</Link>
            <Link className="button-link secondary-link" to="/catalog/attributes"><Tags size={16} /> Katalog Kaynaklari</Link>
            {canSendMarketplaces && <Link className="button-link" to="/products/publish"><Send size={16} /> Aktarim Hazirlama Sihirbazi</Link>}
          </>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && drafts.length === 0 ? <LoadingState /> : null}

      <section className="workflow-grid">
        <section className="panel compact-panel">
          <h2>Listeye Urun Al</h2>
          <div className="form-grid">
            <Field label="Pazaryeri Hesabi">
              <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
                <option value="">Pazaryeri seciniz</option>
                {marketplaces.map((marketplace) => <option key={marketplace.id} value={marketplace.id}>{marketplace.name} ({marketplace.code})</option>)}
              </select>
            </Field>
            <div className="soft-empty"><strong>{selectedProducts.length} urun secildi</strong><span>{selectedMarketplace?.name || 'Pazaryeri secilmedi'}</span></div>
            {canSendMarketplaces && <button type="button" disabled={loading} onClick={createDraft}><CheckCircle2 size={16} /> Onizle ve Listeye Ekle</button>}
          </div>
          <DataTable
            rows={products}
            emptyTitle="Urun yok"
            emptyText="Aktarim listesine almak icin once urun ekleyin."
            columns={[
              { key: 'select', label: '', render: (row) => <input type="checkbox" title={row.product_type === 'parent' ? 'Parent urun dogrudan hazirlanamaz; child varyantlari secin.' : undefined} disabled={row.product_type === 'parent'} checked={selectedProducts.includes(row.id)} onChange={() => toggleProduct(row.id)} /> },
              { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong>{row.product_type === 'parent' ? <small className="variant-badge parent">Parent aggregate</small> : null}{row.product_type === 'parent' ? <span>Dogrudan hazirlanamaz; child varyantlari secin.</span> : null}{row.parent ? <span>{row.parent.name || row.parent.sku} / {row.variant_group_key || '-'}</span> : null}</div> },
              { key: 'sku', label: 'SKU' },
              { key: 'category', label: 'Kategori' },
              { key: 'score', label: 'Hazirlik', render: (row) => { const summary = productReadinessSummary(row, selectedMarketplaceCode); return <div className="score-cell"><strong>{summary.score}%</strong><span>{summary.reason}</span></div>; } },
              { key: 'status', label: 'Durum', render: (row) => row.product_type === 'parent' ? <span className="status-pill blocked">Parent</span> : <span className={isMarketplaceReady(row, selectedMarketplaceCode) ? 'status-pill ready' : 'status-pill blocked'}>{isMarketplaceReady(row, selectedMarketplaceCode) ? 'Hazir' : 'Eksik'}</span> },
              { key: 'edit', label: 'Islem', render: (row) => row.product_type === 'parent' ? <Link className="table-action-link" to={`/products/${row.id}`}>Varyantlari gor</Link> : <Link className="table-action-link" to={`/products/${row.id}/edit`}><Edit3 size={14} /> Duzenle</Link> },
            ]}
          />
        </section>

        <section className="panel compact-panel">
          <h2>Aktarim Hazirlik Onizleme</h2>
          {previewDraft ? (
            <>
              <div className="soft-empty"><strong>Aktarim #{previewDraft.id}</strong><span>{draftStatusLabel(previewDraft)}</span></div>
              <div className="result-summary-grid">
                <div><span>Pazaryeri</span><strong>{previewDraft.marketplace_code || selectedMarketplace?.code || '-'}</strong></div>
                <div><span>Urun sayisi</span><strong>{previewDraft.product_ids?.length || selectedProducts.length || 0}</strong></div>
                <div><span>Sonuc</span><strong>{previewDraft.result_summary?.message || previewDraft.error_message || draftMissingText(previewDraft) || 'Provider gonderimine hazir'}</strong></div>
              </div>
            </>
          ) : (
            <div className="soft-empty">Urunleri secip listeye eklediginde aktarim hazirlik onizlemesi burada gorunur.</div>
          )}
        </section>
      </section>

      {selectedDrafts.length > 0 && (
        <section className="state-box bulk-action-bar">
          <span>{selectedDrafts.length} aktarim kaydi secildi.</span>
          {canSendMarketplaces && <button type="button" disabled={loading || activeQueueTab !== 'ready'} onClick={sendSelectedDrafts}><Send size={16} /> Secilenleri Hazirla</button>}
        </section>
      )}

      <section className="panel compact-filter-panel">
        <div className="compact-filter-heading">
          <strong>Aktarim filtreleri</strong>
          <span>Hazir urunleri one alin veya pazaryerine gore listeyi daraltin.</span>
        </div>
        <div className="product-filter-row">
          <select value={marketplaceFilter} onChange={(event) => { setMarketplaceFilter(event.target.value); setSelectedDrafts([]); }}>
            <option value="">Tum pazaryerleri</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
        </div>
      </section>

      <div className="tabs">
        <button type="button" className={activeQueueTab === 'ready' ? 'tab active' : 'tab'} onClick={() => { setActiveQueueTab('ready'); setSelectedDrafts([]); }}>
          Hazirlanmaya Uygun ({readyDrafts.length})
        </button>
        <button type="button" className={activeQueueTab === 'blocked' ? 'tab active' : 'tab'} onClick={() => { setActiveQueueTab('blocked'); setSelectedDrafts([]); }}>
          Duzeltilmesi Gerekenler ({blockedDrafts.length})
        </button>
      </div>

      <section className="panel">
        <h2>Aktarim Listesi ve Sonuclar</h2>
        <DataTable
          rows={visibleDrafts}
          emptyTitle="Aktarim kaydi yok"
          emptyText={activeQueueTab === 'ready' ? 'Hazir urun yok. Once urunleri secip onizleme ile aktarim listesine alin.' : 'Duzeltilmesi gereken aktarim kaydi yok.'}
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedDrafts.includes(row.id)} onChange={() => toggleDraft(row.id)} /> },
            { key: 'id', label: 'Kayit' },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
            { key: 'status', label: 'Durum', render: (row) => <span className={row.status === 'ready' || row.status === 'queued' ? 'status-pill ready' : 'status-pill blocked'}>{draftStatusLabel(row)}</span> },
            { key: 'products', label: 'Urun', render: (row) => row.product_ids?.length || 0 },
            { key: 'missing', label: 'Eksik Sebebi', render: (row) => draftMissingText(row) || 'Eksik yok' },
            { key: 'batch', label: 'Sonuc', render: (row) => row.result_summary?.message || row.error_message || (row.status === 'queued' ? 'Provider gonderimine hazirlandi' : '-') },
            {
              key: 'fix',
              label: 'Duzelt',
              render: (row) => {
                const product = firstDraftProduct(row);
                const missing = draftMissingFields(row);
                if (!product || missing.length === 0) return '-';
                const target = fixTarget(product, missing, row.marketplace_code);
                return <Link className="table-action-link" to={target.href}>{target.label}</Link>;
              },
            },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => (
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => setPreviewDraft(row)}>Onizle</button>
                  {canSendMarketplaces && <button type="button" disabled={loading || row.status === 'blocked'} onClick={() => sendDraft(row.id)}><Send size={15} /> Hazirla</button>}
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
