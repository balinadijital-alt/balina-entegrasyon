import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Search, Send } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import {
  isMarketplaceReady,
  missingFields,
  missingLabel,
  missingTextFromFields,
  publishBlockReason,
  readinessScore,
} from './productWorkflow.js';

const steps = ['Yeni Islem', 'Hazir Urunler', 'Eksik Urunler', 'Urun Sec', 'Son Kontrol', 'Kuyruga Al'];

function draftStatusLabel(status) {
  if (status === 'ready') return 'Hazir';
  if (status === 'blocked') return 'Eksik';
  if (status === 'queued') return 'Kuyruga alindi';
  return status || '-';
}

function draftMissingFields(draft) {
  return Object.values(draft?.readiness_report || {})
    .flatMap((item) => item?.missing_fields || [])
    .filter(Boolean);
}

function draftMissingText(draft) {
  return missingTextFromFields(draftMissingFields(draft));
}

function marketplaceName(code) {
  if (code === 'trendyol') return 'Trendyol';
  if (code === 'hepsiburada') return 'Hepsiburada';
  return 'Pazaryeri';
}

function fieldFixTarget(product, field) {
  if (field === 'category_mapping' || field === 'marketplace_category') {
    return `/marketplace-mapping/categories?category=${encodeURIComponent(product.category || '')}`;
  }
  if (field === 'brand') {
    return '/marketplace-mapping/brands';
  }
  if (field === 'attributes' || field === 'required_attributes') {
    return '/marketplace-mapping/attributes';
  }
  if (field === 'variant_attributes') {
    return '/marketplace-mapping/variants';
  }
  return `/products/${product.id}/edit`;
}

function fixCta(field) {
  if (field === 'category_mapping' || field === 'marketplace_category') return 'Kategori eslestir';
  if (field === 'brand') return 'Marka eslestir';
  if (field === 'attributes' || field === 'required_attributes') return 'Nitelik eslestir';
  if (field === 'variant_attributes') return 'Varyant eslestir';
  return 'Urunu duzenle';
}

function productReadinessSummary(product, marketplaceCode) {
  if (product.product_type === 'parent' && product.variant_readiness_rollup) {
    const marketplace = product.variant_readiness_rollup.marketplaces?.[marketplaceCode] || product.variant_readiness_rollup;
    return {
      score: marketplace.readiness_score || 0,
      reason: `Parent urun / ${marketplace.ready_children || 0}/${marketplace.total_children || 0} varyant hazir`,
    };
  }

  return {
    score: readinessScore(product, marketplaceCode),
    reason: product.parent ? `${product.parent.name || product.parent.sku} / ${product.variant_group_key || '-'} / ${missingTextFromFields(missingFields(product, marketplaceCode)) || 'Eksik yok'}` : publishBlockReason(product, marketplaceCode),
  };
}

export function ProductPublishWizardPage() {
  const [searchParams] = useSearchParams();
  const { notify, user } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [bulkForm, setBulkForm] = useState({
    name: 'Toplu urun gonderimi',
    operation: 'product_send',
    schedule: 'manual',
    category: '',
    source: 'all_products',
    brand: '',
    includePassive: false,
    includeOutOfStock: false,
    priceRule: 'none',
    priceValue: '',
    cargoCompany: '',
    shippingWarehouse: '',
    returnWarehouse: '',
    randomBarcode: false,
  });

  const selectedMarketplace = useMemo(
    () => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)),
    [marketplaces, marketplaceId],
  );
  const marketplaceCode = selectedMarketplace?.code || '';
  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');

  const readyProducts = useMemo(() => products.filter((product) => product.product_type !== 'parent' && isMarketplaceReady(product, marketplaceCode)), [products, marketplaceCode]);
  const blockedProducts = useMemo(() => products.filter((product) => product.product_type === 'parent' || !isMarketplaceReady(product, marketplaceCode)), [products, marketplaceCode]);
  const selectedRows = useMemo(() => readyProducts.filter((product) => selectedProducts.includes(product.id)), [readyProducts, selectedProducts]);
  const filteredDrafts = useMemo(() => drafts.filter((item) => {
    const query = search.trim().toLowerCase();
    return !query || [
      item.id,
      item.marketplace_code,
      item.status,
      item.company?.name,
      item.result_summary?.batch_request_id,
      item.error_message,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  }), [drafts, search]);
  const selectedAverageScore = selectedRows.length
    ? Math.round(selectedRows.reduce((sum, product) => sum + readinessScore(product, marketplaceCode), 0) / selectedRows.length)
    : 0;

  const filteredReadyProducts = useMemo(() => readyProducts.filter((product) => {
    const query = search.trim().toLowerCase();
    return !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
  }), [readyProducts, search]);

  const load = async () => {
    await run(async () => {
      const [productResponse, marketplaceResponse, draftResponse] = await Promise.all([api.products.list(), api.marketplaces.list(), api.productPublish.drafts()]);
      setProducts(productResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setDrafts(draftResponse.data || []);
      setMarketplaceId((current) => current || marketplaceResponse.data?.[0]?.id || '');
      const productId = Number(searchParams.get('product'));
      if (productId && (productResponse.data || []).some((product) => Number(product.id) === productId)) {
        setSelectedProducts([productId]);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleProduct = (id) => {
    if (!readyProducts.some((product) => product.id === id)) return;
    setSelectedProducts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setDraft(null);
  };

  const toggleVisibleProducts = () => {
    const visibleIds = filteredReadyProducts.map((product) => product.id);
    const allSelected = visibleIds.every((id) => selectedProducts.includes(id));
    setSelectedProducts((current) => (allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));
    setDraft(null);
  };

  const validateDraft = async () => {
    if (!canSendMarketplaces) return;
    const productIds = selectedProducts.length > 0 ? selectedProducts : readyProducts.map((product) => product.id);
    if (!marketplaceId || productIds.length === 0) {
      setError('Pazaryeri ve gonderilecek hazir urun zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: productIds,
        mappings: {},
        price_controls: { source: 'bulk-marketplace-operation', filters: bulkForm },
      });
      setDraft(response);
      setSelectedProducts(productIds);
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Eksik alanlar bulundu.' : 'Islem kaydedildi.');
    }, { onError: (message) => notify('error', message) });
  };

  const sendDraft = async () => {
    if (!canSendMarketplaces || !draft?.id) return;
    await run(async () => {
      const response = await api.productPublish.send(draft.id);
      setDraft(response);
      setShowForm(false);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Urunler aktarim kuyruguna alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader
        title="Toplu Pazaryeri Islemleri"
        description="Pazaryeri, magaza, islem ve filtreleri secerek urunlerinizi toplu gonderime alin."
        actions={<Link className="button-link secondary-link" to="/marketplace-mapping"><CheckCircle2 size={16} /> Pazaryeri Eslestirmeleri</Link>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : null}

      <section className="bulk-operation-shell">
        <header className="bulk-operation-toolbar">
          <label className="resource-search compact-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Islem, pazaryeri veya batch ara" />
          </label>
          {canSendMarketplaces && (
            <button type="button" onClick={() => { setShowForm(true); setDraft(null); }}>
              <Plus size={16} /> Yeni Pazaryeri Islemi
            </button>
          )}
        </header>

        <DataTable
          rows={filteredDrafts}
          emptyTitle="Toplu pazaryeri islemi yok"
          emptyText="Yeni Pazaryeri Islemi butonu ile gonderim formunu acin."
          columns={[
            { key: 'id', label: 'Islem No', render: (row) => row.id || '-' },
            { key: 'name', label: 'Adi', render: (row) => row.result_summary?.name || `Pazaryeri islemi #${row.id}` },
            { key: 'operation', label: 'Islem', render: () => 'Urun gonder' },
            { key: 'marketplace_code', label: 'Pazaryeri', render: (row) => row.marketplace_code || '-' },
            { key: 'schedule', label: 'Zamanlama', render: () => 'Manuel' },
            { key: 'status', label: 'Durum', render: (row) => <span className={row.status === 'blocked' ? 'status-pill blocked' : 'status-pill ready'}>{draftStatusLabel(row.status)}</span> },
            {
              key: 'actions',
              label: 'Islemler',
              render: (row) => (
                <div className="row-actions">
                  <Link className="table-action-link" to="/products/publish-queue">Detay</Link>
                </div>
              ),
            },
          ]}
        />
      </section>

      {showForm && (
        <section className="bulk-operation-form-panel">
          <div className="wizard-step-header">
            <span>Yeni Islem</span>
            <h2>Toplu Pazaryeri Islemleri</h2>
            <p>Filtrelemeleri gerceklestirin ve kaydet butonuna tiklayin.</p>
          </div>
          <div className="workflow-modal-warning bulk-operation-warning">
            <AlertTriangle size={17} />
            <span>Filtrelemeleri gerceklestirin ve kaydet butonuna tiklayin.</span>
          </div>
          <div className="marketplace-card-grid compact-marketplace-grid">
            {marketplaces.map((marketplace) => (
              <button type="button" className={String(marketplace.id) === String(marketplaceId) ? 'marketplace-select-card active' : 'marketplace-select-card'} key={marketplace.id} onClick={() => { setMarketplaceId(String(marketplace.id)); setSelectedProducts([]); setDraft(null); }}>
                <strong>{marketplace.name}</strong>
                <span>{marketplaceName(marketplace.code)} hesabi</span>
                <small>{marketplace.is_active === false ? 'Pasif hesap' : 'Aktif hesap'}</small>
              </button>
            ))}
          </div>
          {marketplaces.length === 0 && <div className="soft-empty">Pazaryeri hesabi bulunamadi. Once pazaryeri hesabi baglayin.</div>}
          <section className="bulk-operation-form-grid">
            <label><span>Adi</span><input value={bulkForm.name} onChange={(event) => setBulkForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>Pazaryeri</span><input value={marketplaceName(marketplaceCode)} readOnly /></label>
            <label><span>Magaza</span><input value={selectedMarketplace?.name || ''} readOnly placeholder="Magaza seciniz" /></label>
            <label>
              <span>Islem</span>
              <select value={bulkForm.operation} onChange={(event) => setBulkForm((current) => ({ ...current, operation: event.target.value }))}>
                <option value="product_send">Urun gonder</option>
                <option value="price_stock_update">Fiyat / stok guncelle</option>
                <option value="product_status_check">Durum sorgula</option>
              </select>
            </label>
            <label>
              <span>Zamanlama</span>
              <select value={bulkForm.schedule} onChange={(event) => setBulkForm((current) => ({ ...current, schedule: event.target.value }))}>
                <option value="manual">Manuel</option>
                <option value="daily">Gunde bir</option>
                <option value="hourly">Saatlik</option>
              </select>
            </label>
            <label><span>Kategoriler</span><input value={bulkForm.category} onChange={(event) => setBulkForm((current) => ({ ...current, category: event.target.value }))} placeholder="Kategori filtresi" /></label>
            <label>
              <span>Urun Kaynagi</span>
              <select value={bulkForm.source} onChange={(event) => setBulkForm((current) => ({ ...current, source: event.target.value }))}>
                <option value="ready_products">Hazir urunler</option>
                <option value="all_products">Tum urunler</option>
                <option value="selected_products">Secili urunler</option>
              </select>
            </label>
            <label><span>Markalar</span><input value={bulkForm.brand} onChange={(event) => setBulkForm((current) => ({ ...current, brand: event.target.value }))} placeholder="Marka filtresi" /></label>
            <label>
              <span>Gonderilecek Urunler</span>
              <select value={bulkForm.source} onChange={(event) => setBulkForm((current) => ({ ...current, source: event.target.value }))}>
                <option value="ready_products">Hazir urunler</option>
                <option value="selected_products">Elle secilen urunler</option>
                <option value="all_products">Tum urunler</option>
              </select>
            </label>
            <label>
              <span>Fiyat Kisitlama</span>
              <select value={bulkForm.priceRule} onChange={(event) => setBulkForm((current) => ({ ...current, priceRule: event.target.value }))}>
                <option value="none">Yok</option>
                <option value="min">Minimum fiyat</option>
                <option value="max">Maksimum fiyat</option>
              </select>
            </label>
            <label><span>Fiyat Degeri</span><input value={bulkForm.priceValue} onChange={(event) => setBulkForm((current) => ({ ...current, priceValue: event.target.value }))} placeholder="0.00" /></label>
            <label><span>Varsayilan Kargo Firmasi</span><input value={bulkForm.cargoCompany} onChange={(event) => setBulkForm((current) => ({ ...current, cargoCompany: event.target.value }))} /></label>
            <label><span>Sevkiyat Depo Adresi</span><input value={bulkForm.shippingWarehouse} onChange={(event) => setBulkForm((current) => ({ ...current, shippingWarehouse: event.target.value }))} /></label>
            <label><span>Iade Depo Adresi</span><input value={bulkForm.returnWarehouse} onChange={(event) => setBulkForm((current) => ({ ...current, returnWarehouse: event.target.value }))} /></label>
            <label className="check-row"><input type="checkbox" checked={bulkForm.includePassive} onChange={(event) => setBulkForm((current) => ({ ...current, includePassive: event.target.checked }))} /> Pasif urunler gonderilsin mi?</label>
            <label className="check-row"><input type="checkbox" checked={bulkForm.includeOutOfStock} onChange={(event) => setBulkForm((current) => ({ ...current, includeOutOfStock: event.target.checked }))} /> Stokta olmayan urunler gonderilsin mi?</label>
            <label className="check-row"><input type="checkbox" checked={bulkForm.randomBarcode} onChange={(event) => setBulkForm((current) => ({ ...current, randomBarcode: event.target.checked }))} /> Urunlere Rastgele Barkod Ata</label>
          </section>
          {draft && (
            <div className={draft.status === 'blocked' ? 'state-box workflow-warning' : 'state-box success-empty'}>
              <AlertTriangle size={18} />
              <span>Islem #{draft.id}: {draftStatusLabel(draft.status)}. {draftMissingText(draft) || 'Gonderime hazir.'}</span>
            </div>
          )}
          <div className="wizard-actions inline-actions">
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Vazgec</button>
            <button type="button" disabled={loading || !marketplaceId} onClick={validateDraft}><CheckCircle2 size={16} /> Kaydet</button>
            {draft && canSendMarketplaces && <button type="button" disabled={loading || draft?.status === 'blocked'} onClick={sendDraft}><Send size={16} /> Kuyruga Al</button>}
          </div>
        </section>
      )}
    </>
  );
}
