import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Edit3, Layers3, Send, Tags } from 'lucide-react';
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

const steps = ['Pazaryeri Sec', 'Hazir Urunler', 'Eksik Urunler', 'Urun Sec', 'Son Kontrol', 'Kuyruga Al'];

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
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState('');

  const selectedMarketplace = useMemo(
    () => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)),
    [marketplaces, marketplaceId],
  );
  const marketplaceCode = selectedMarketplace?.code || '';
  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');

  const readyProducts = useMemo(() => products.filter((product) => product.product_type !== 'parent' && isMarketplaceReady(product, marketplaceCode)), [products, marketplaceCode]);
  const blockedProducts = useMemo(() => products.filter((product) => product.product_type === 'parent' || !isMarketplaceReady(product, marketplaceCode)), [products, marketplaceCode]);
  const selectedRows = useMemo(() => readyProducts.filter((product) => selectedProducts.includes(product.id)), [readyProducts, selectedProducts]);
  const selectedAverageScore = selectedRows.length
    ? Math.round(selectedRows.reduce((sum, product) => sum + readinessScore(product, marketplaceCode), 0) / selectedRows.length)
    : 0;

  const filteredReadyProducts = useMemo(() => readyProducts.filter((product) => {
    const query = search.trim().toLowerCase();
    return !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
  }), [readyProducts, search]);

  const load = async () => {
    await run(async () => {
      const [productResponse, marketplaceResponse] = await Promise.all([api.products.list(), api.marketplaces.list()]);
      setProducts(productResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
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
    if (!marketplaceId || selectedProducts.length === 0) {
      setError('Urun ve pazaryeri secimi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: selectedProducts,
        mappings: {},
        price_controls: { source: 'publish-wizard' },
      });
      setDraft(response);
      setStep(4);
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Eksik alanlar bulundu.' : 'Son kontrol hazir.');
    }, { onError: (message) => notify('error', message) });
  };

  const sendDraft = async () => {
    if (!canSendMarketplaces || !draft?.id) return;
    await run(async () => {
      const response = await api.productPublish.send(draft.id);
      setDraft(response);
      setStep(5);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Urunler aktarim kuyruguna alindi.');
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader
        title="Urun Gonderme Sihirbazi"
        description="Bu ekranda mapping duzenlenmez; sadece hazir urunler secilir, son kontrol yapilir ve kuyruga alinir."
        actions={<Link className="button-link secondary-link" to="/marketplace-readiness"><CheckCircle2 size={16} /> Hazirlik Merkezi</Link>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : null}

      <section className="panel wizard-panel publish-wizard-panel">
        <div className="wizard-steps">
          {steps.map((label, index) => (
            <button type="button" className={index === step ? 'wizard-step active' : 'wizard-step'} key={label} onClick={() => setStep(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="publish-wizard-body">
          {step === 0 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 1 / {steps.length}</span>
                <h2>Pazaryeri sec</h2>
                <p>Hazir urun listesi secilen pazaryerine gore hesaplanir.</p>
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
            </>
          )}

          {step === 1 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 2 / {steps.length}</span>
                <h2>Hazir urunleri goster</h2>
                <p>{marketplaceName(marketplaceCode)} icin kategori, marka, nitelik ve varyant kontrollerinden gecen urunler burada secilebilir.</p>
              </div>
              <section className="panel compact-filter-panel nested-panel">
                <div className="product-filter-row">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Urun, SKU veya barkod ara" />
                  <button type="button" className="secondary-button" onClick={toggleVisibleProducts}>Gorunen hazirlari sec</button>
                </div>
              </section>
              <DataTable
                rows={filteredReadyProducts}
                emptyTitle="Hazir urun yok"
                emptyText="Hazir urun bulunamadi. Eksikleri tamamlamak icin Hazirlik Merkezi'ne gidin."
                columns={[
                  { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedProducts.includes(row.id)} onChange={() => toggleProduct(row.id)} /> },
                  { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span>{row.parent ? <small>{row.parent.name || row.parent.sku} / {row.variant_group_key || '-'}</small> : null}</div> },
                  { key: 'score', label: 'Hazirlik', render: (row) => <div className="score-cell"><strong>{readinessScore(row, marketplaceCode)}%</strong><span>Gonderime hazir</span></div> },
                  { key: 'category', label: 'Kategori', render: (row) => row.category || '-' },
                  { key: 'brand', label: 'Marka', render: (row) => row.brand || '-' },
                  { key: 'status', label: 'Durum', render: () => <span className="status-pill ready">Hazir</span> },
                ]}
              />
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 3 / {steps.length}</span>
                <h2>Eksik urunleri ayri goster</h2>
                <p>Blocked urunler bu sihirbazda secilemez. Ilgili mapping sayfasinda eksik tamamlandiktan sonra tekrar hazir listeye duser.</p>
              </div>
              <div className="quick-fix-strip">
                <Link className="button-link secondary-link" to="/marketplace-mapping/categories"><Layers3 size={16} /> Kategori eslestir</Link>
                <Link className="button-link secondary-link" to="/marketplace-mapping/brands"><CheckCircle2 size={16} /> Marka eslestir</Link>
                <Link className="button-link secondary-link" to="/marketplace-mapping/attributes"><Tags size={16} /> Nitelik eslestir</Link>
                <Link className="button-link secondary-link" to="/marketplace-mapping/variants"><Tags size={16} /> Varyant eslestir</Link>
              </div>
              <DataTable
                rows={blockedProducts}
                emptyTitle="Eksik urun yok"
                emptyText="Tum urunler bu pazaryeri icin hazir gorunuyor."
                columns={[
                  { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span>{row.product_type === 'parent' ? <small>Parent urun dogrudan gonderilemez</small> : null}</div> },
                  { key: 'score', label: 'Hazirlik', render: (row) => { const summary = productReadinessSummary(row, marketplaceCode); return <div className="score-cell"><strong>{summary.score}%</strong><span>{summary.reason}</span></div>; } },
                  { key: 'missing', label: 'Eksikler', render: (row) => missingTextFromFields(missingFields(row, marketplaceCode)) || (row.product_type === 'parent' ? 'Child varyant secilmeli' : '-') },
                  {
                    key: 'fix',
                    label: 'Yonlendirme',
                    render: (row) => {
                      const firstMissing = missingFields(row, marketplaceCode)[0];
                      if (!firstMissing) return <Link className="table-action-link" to={`/products/${row.id}/edit`}><Edit3 size={14} /> Urunu incele</Link>;
                      return <Link className="table-action-link" to={fieldFixTarget(row, firstMissing)}>{fixCta(firstMissing)}</Link>;
                    },
                  },
                ]}
              />
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 4 / {steps.length}</span>
                <h2>Gonderilecek urunleri sec</h2>
                <p>Secili urunler son kontrol icin validate edilir. Blocked urunler kuyruga alinmaz.</p>
              </div>
              <div className="publish-summary-grid">
                <div className="soft-empty"><strong>{selectedRows.length}</strong><span>Secili hazir urun</span></div>
                <div className="soft-empty"><strong>{readyProducts.length}</strong><span>Toplam hazir urun</span></div>
                <div className="soft-empty"><strong>{blockedProducts.length}</strong><span>Eksik / blocked urun</span></div>
                <div className="soft-empty"><strong>{selectedAverageScore}%</strong><span>Ortalama hazirlik</span></div>
              </div>
              <DataTable
                rows={selectedRows}
                emptyTitle="Urun secilmedi"
                emptyText="Hazir urunler adimindan gonderilecek urunleri secin."
                columns={[
                  { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span></div> },
                  { key: 'category', label: 'Kategori', render: (row) => row.category || '-' },
                  { key: 'brand', label: 'Marka', render: (row) => row.brand || '-' },
                  { key: 'remove', label: 'Islem', render: (row) => <button type="button" className="table-action-link" onClick={() => toggleProduct(row.id)}>Cikar</button> },
                ]}
              />
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 5 / {steps.length}</span>
                <h2>Son kontrol</h2>
                <p>Mevcut endpointler ile son validate calisir. Bu ekrandan mapping duzenlenmez.</p>
              </div>
              <div className="publish-summary-grid">
                <div className="soft-empty"><strong>{marketplaceName(marketplaceCode)}</strong><span>Pazaryeri</span></div>
                <div className="soft-empty"><strong>{selectedRows.length}</strong><span>Secili urun</span></div>
                <div className="soft-empty"><strong>{selectedAverageScore}%</strong><span>Ortalama hazirlik</span></div>
              </div>
              {draft ? (
                <div className={draft.status === 'blocked' ? 'state-box workflow-warning' : 'state-box success-empty'}>
                  <AlertTriangle size={18} />
                  <span>Aktarim #{draft.id}: {draftStatusLabel(draft.status)}. {draftMissingText(draft) || 'Kritik eksik yok.'}</span>
                </div>
              ) : (
                <div className="soft-empty">Kontrol et ve onizle ile secili hazir urunler icin draft olusturun.</div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 6 / {steps.length}</span>
                <h2>Kuyruga alindi</h2>
                <p>Sonuclari gonderim kuyrugu ekraninda takip edin.</p>
              </div>
              <div className="preview-grid">
                <div className="soft-empty"><strong>{draftStatusLabel(draft?.status)}</strong><span>Durum</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.queued_product_count || draft?.product_ids?.length || 0}</strong><span>Kuyruga alinan urun</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.batch_request_id || draft?.id || '-'}</strong><span>Batch / takip no</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.message || draft?.error_message || 'Sonuc bekleniyor.'}</strong><span>Sonuc mesaji</span></div>
              </div>
              <div className="quick-fix-strip">
                <Link className="button-link secondary-link" to="/products/publish-queue">Gonderim kuyruguna git</Link>
                <Link className="button-link secondary-link" to="/api-logs">Hata merkezi</Link>
              </div>
            </>
          )}
        </div>

        <div className="wizard-actions">
          <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Geri</button>
          {step < 3 && <button type="button" disabled={step === 0 && !marketplaceId} onClick={() => setStep((current) => current + 1)}>Ileri <ChevronRight size={16} /></button>}
          {step === 3 && <button type="button" disabled={selectedProducts.length === 0} onClick={validateDraft}><CheckCircle2 size={16} /> Kontrol Et</button>}
          {step === 4 && !draft && canSendMarketplaces && <button type="button" disabled={loading || selectedProducts.length === 0} onClick={validateDraft}><CheckCircle2 size={16} /> Kontrol Et</button>}
          {step === 4 && draft && canSendMarketplaces && <button type="button" disabled={loading || draft?.status === 'blocked'} onClick={sendDraft}><Send size={16} /> Kuyruga Al</button>}
        </div>
      </section>
    </>
  );
}
