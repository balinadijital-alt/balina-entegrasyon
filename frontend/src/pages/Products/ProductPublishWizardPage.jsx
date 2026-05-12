import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Edit3, Layers3, Send, Tags } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
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

const steps = ['Pazaryeri Sec', 'Urunleri Sec', 'Hazirlik Kontrolu', 'Eksikleri Duzelt', 'Gonderim Ozeti', 'Gonderim Sonucu'];

const commonRequirements = ['name', 'brand', 'category', 'barcode', 'sku', 'price', 'stock', 'attributes', 'vat_rate', 'description', 'seo', 'image', 'cargo'];
const marketplaceRequirements = ['marketplace_category', 'category_mapping', 'required_attributes'];

function draftStatusLabel(status) {
  if (status === 'ready') return 'Hazir';
  if (status === 'blocked') return 'Eksik';
  if (status === 'queued') return 'Gonderildi';
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
    return `/products/category-mapping?category=${encodeURIComponent(product.category || '')}`;
  }
  if (field === 'attributes' || field === 'required_attributes') {
    return `/products/${product.id}/edit`;
  }
  return `/products/${product.id}/edit`;
}

export function ProductPublishWizardPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(null);
  const [mappings, setMappings] = useState({ category_id: '', attributes: '' });
  const [priceControls, setPriceControls] = useState({ minimum_profit_rate: 15, include_shipping_cost: true });
  const [requiredAttributes, setRequiredAttributes] = useState([]);
  const [search, setSearch] = useState('');
  const [readinessFilter, setReadinessFilter] = useState('');
  const [missingFilter, setMissingFilter] = useState('');

  const selectedMarketplace = useMemo(
    () => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)),
    [marketplaces, marketplaceId],
  );
  const marketplaceCode = selectedMarketplace?.code || '';

  const selectedRows = useMemo(
    () => products.filter((product) => selectedProducts.includes(product.id)),
    [products, selectedProducts],
  );

  const filteredProducts = useMemo(() => products.filter((product) => {
    const query = search.trim().toLowerCase();
    const productMissing = missingFields(product, marketplaceCode);
    const ready = isMarketplaceReady(product, marketplaceCode);
    const matchesSearch = !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesReadiness = !readinessFilter || (readinessFilter === 'ready' ? ready : !ready);
    const matchesMissing = !missingFilter || productMissing.includes(missingFilter);

    return matchesSearch && matchesReadiness && matchesMissing;
  }), [products, marketplaceCode, search, readinessFilter, missingFilter]);

  const selectedMissingFields = useMemo(() => [...new Set(selectedRows.flatMap((product) => missingFields(product, marketplaceCode)))], [selectedRows, marketplaceCode]);
  const selectedReadyCount = selectedRows.filter((product) => isMarketplaceReady(product, marketplaceCode)).length;
  const selectedAverageScore = selectedRows.length
    ? Math.round(selectedRows.reduce((sum, product) => sum + readinessScore(product, marketplaceCode), 0) / selectedRows.length)
    : 0;

  const load = async () => {
    await run(async () => {
      const [productResponse, marketplaceResponse] = await Promise.all([api.products.list(), api.marketplaces.list()]);
      setProducts(productResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setMarketplaceId((current) => current || marketplaceResponse.data?.[0]?.id || '');
      const productId = searchParams.get('product');
      if (productId) {
        setSelectedProducts([Number(productId)]);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleProduct = (id) => {
    setSelectedProducts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    setDraft(null);
  };

  const toggleVisibleProducts = () => {
    const visibleIds = filteredProducts.map((product) => product.id);
    const allSelected = visibleIds.every((id) => selectedProducts.includes(id));
    setSelectedProducts((current) => (allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]));
    setDraft(null);
  };

  const fetchRequiredAttributes = async () => {
    if (selectedMarketplace?.code !== 'trendyol') return;
    const categoryId = mappings.category_id || selectedRows[0]?.trendyol_category_id;
    if (!categoryId) {
      setRequiredAttributes([]);
      notify('error', 'Trendyol zorunlu ozellikleri icin kategori kodu gereklidir.');
      return;
    }
    await run(async () => {
      const response = await api.marketplaces.trendyolCategoryAttributes(selectedMarketplace.id, categoryId);
      const attributes = (response.attributes || response.raw?.categoryAttributes || []).filter((item) => item.required);
      setRequiredAttributes(attributes);
      notify('success', `${attributes.length} zorunlu Trendyol ozelligi bulundu.`);
    }, { onError: (message) => notify('error', message) });
  };

  const validateDraft = async () => {
    if (!marketplaceId || selectedProducts.length === 0) {
      setError('Urun ve pazaryeri secimi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.productPublish.validate({
        marketplace_account_id: marketplaceId,
        product_ids: selectedProducts,
        mappings,
        price_controls: priceControls,
      });
      setDraft(response);
      setStep(4);
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Eksik alanlar bulundu.' : 'Gonderim onizlemesi hazir.');
    }, { onError: (message) => notify('error', message) });
  };

  const sendDraft = async () => {
    if (!draft?.id) return;
    await run(async () => {
      const response = await api.productPublish.send(draft.id);
      setDraft(response);
      setStep(5);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Gonderim kuyruga alindi.');
    }, { onError: (message) => notify('error', message) });
  };

  const requirementCount = (field) => selectedRows.filter((product) => missingFields(product, marketplaceCode).includes(field)).length;

  return (
    <>
      <PageHeader title="Pazaryerine Urun Gonderme Sihirbazi" />
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
                <p>Hazirlik kontrolu secilen pazaryerinin kategori, marka, nitelik ve gonderim kurallarina gore calisir.</p>
              </div>
              <div className="marketplace-card-grid compact-marketplace-grid">
                {marketplaces.map((marketplace) => (
                  <button type="button" className={String(marketplace.id) === String(marketplaceId) ? 'marketplace-select-card active' : 'marketplace-select-card'} key={marketplace.id} onClick={() => { setMarketplaceId(String(marketplace.id)); setDraft(null); }}>
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
                <h2>Urunleri sec</h2>
                <p>{marketplaceName(marketplaceCode)} icin gonderilecek urunleri secin; hazirlik puani ve eksik alanlar pazaryerine gore hesaplanir.</p>
              </div>
              <section className="panel compact-filter-panel nested-panel">
                <div className="product-filter-row">
                  <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Urun, SKU veya barkod ara" />
                  <select value={readinessFilter} onChange={(event) => setReadinessFilter(event.target.value)}>
                    <option value="">Tum hazirlik durumlari</option>
                    <option value="ready">Hazir</option>
                    <option value="blocked">Eksik</option>
                  </select>
                  <select value={missingFilter} onChange={(event) => setMissingFilter(event.target.value)}>
                    <option value="">Eksik alan filtresi</option>
                    {[...commonRequirements, ...marketplaceRequirements].map((field) => <option key={field} value={field}>{missingLabel(field)}</option>)}
                  </select>
                  <button type="button" className="secondary-button" onClick={toggleVisibleProducts}>Gorunenleri sec</button>
                </div>
              </section>
              <DataTable
                rows={filteredProducts}
                emptyTitle="Gonderilecek urun yok"
                emptyText="Once urun ekleme sihirbazi ile urun olusturun veya filtreleri temizleyin."
                columns={[
                  { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedProducts.includes(row.id)} onChange={() => toggleProduct(row.id)} /> },
                  { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span></div> },
                  { key: 'score', label: 'Hazirlik', render: (row) => <div className="score-cell"><strong>{readinessScore(row, marketplaceCode)}%</strong><span>{publishBlockReason(row, marketplaceCode)}</span></div> },
                  { key: 'status', label: 'Durum', render: (row) => <span className={isMarketplaceReady(row, marketplaceCode) ? 'status-pill ready' : 'status-pill blocked'}>{isMarketplaceReady(row, marketplaceCode) ? 'Hazir' : 'Eksik'}</span> },
                  { key: 'missing', label: 'Eksikler', render: (row) => missingTextFromFields(missingFields(row, marketplaceCode)) || '-' },
                  { key: 'edit', label: 'Islem', render: (row) => <Link className="table-action-link" to={`/products/${row.id}/edit`}><Edit3 size={14} /> Duzenle</Link> },
                ]}
              />
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 3 / {steps.length}</span>
                <h2>Hazirlik kontrolu</h2>
                <p>Ortak urun alanlari ve {marketplaceName(marketplaceCode)} icin gereken pazaryeri alanlari tek ekranda kontrol edilir.</p>
              </div>
              <section className="publish-readiness-summary">
                <div className="readiness-score-card">
                  <strong>{selectedAverageScore}%</strong>
                  <span>Ortalama hazirlik</span>
                  <div className="progress"><span style={{ width: `${selectedAverageScore}%` }} /></div>
                </div>
                <div className="soft-empty"><strong>{selectedReadyCount}/{selectedRows.length}</strong><span>urun gonderime hazir</span></div>
                <div className="soft-empty"><strong>{selectedMissingFields.length || 0}</strong><span>farkli eksik alan</span></div>
              </section>
              <div className="publish-requirement-grid">
                <section className="panel compact-panel nested-panel">
                  <h2>Ortak gerekli alanlar</h2>
                  {commonRequirements.map((field) => (
                    <div className="requirement-row" key={field}>
                      <span>{missingLabel(field)}</span>
                      <strong>{requirementCount(field) === 0 ? 'Tamam' : `${requirementCount(field)} urunde eksik`}</strong>
                    </div>
                  ))}
                </section>
                <section className="panel compact-panel nested-panel">
                  <h2>{marketplaceName(marketplaceCode)} alanlari</h2>
                  {marketplaceRequirements.map((field) => (
                    <div className="requirement-row" key={field}>
                      <span>{missingLabel(field)}</span>
                      <strong>{requirementCount(field) === 0 ? 'Tamam' : `${requirementCount(field)} urunde eksik`}</strong>
                    </div>
                  ))}
                  {marketplaceCode === 'trendyol' && (
                    <button type="button" className="secondary-button" disabled={loading || selectedRows.length === 0} onClick={fetchRequiredAttributes}>Trendyol zorunlu ozelliklerini getir</button>
                  )}
                  {requiredAttributes.length > 0 && <div className="soft-empty">{requiredAttributes.slice(0, 8).map((item) => item.attributeName || item.attribute?.name || item.attributeId).join(', ')}</div>}
                </section>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 4 / {steps.length}</span>
                <h2>Eksikleri duzelt</h2>
                <p>Eksik urunlerde ilgili duzenleme, kategori eslestirme veya katalog kaynak ekranina hizli gecis yapin.</p>
              </div>
              <div className="quick-fix-strip">
                <Link className="button-link secondary-link" to="/products/category-mapping"><Layers3 size={16} /> Kategori eslestirmeye git</Link>
                <Link className="button-link secondary-link" to="/catalog/attributes"><Tags size={16} /> Katalog kaynaklarina git</Link>
              </div>
              <div className="publish-fix-list">
                {selectedRows.length === 0 ? <div className="soft-empty">Eksik kontrolu icin once urun secin.</div> : selectedRows.map((product) => {
                  const productMissing = missingFields(product, marketplaceCode);
                  return (
                    <div className="publish-fix-card" key={product.id}>
                      <div>
                        <strong>{product.name}</strong>
                        <span>{product.sku} · {readinessScore(product, marketplaceCode)}%</span>
                      </div>
                      <div className="fix-chip-list">
                        {productMissing.length === 0 ? <span className="status-pill ready">Hazir</span> : productMissing.map((field) => (
                          <Link key={field} to={fieldFixTarget(product, field)}>{missingLabel(field)}</Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 5 / {steps.length}</span>
                <h2>Gonderim ozeti</h2>
                <p>Validate islemi pazaryeri uygunlugunu tekrar calistirir ve hazir olmayan urunleri gonderime kapatir.</p>
              </div>
              <div className="publish-summary-grid">
                <div className="soft-empty"><strong>{marketplaceName(marketplaceCode)}</strong><span>Pazaryeri</span></div>
                <div className="soft-empty"><strong>{selectedRows.length}</strong><span>Secili urun</span></div>
                <div className="soft-empty"><strong>{selectedAverageScore}%</strong><span>Ortalama hazirlik</span></div>
              </div>
              <div className="form-grid">
                <Field label="Kategori esleme kodu">
                  <input value={mappings.category_id} onChange={(event) => setMappings({ ...mappings, category_id: event.target.value })} placeholder="Gerekirse pazaryeri kategori kodu" />
                </Field>
                <Field label="Ozellik esleme notu">
                  <textarea value={mappings.attributes} onChange={(event) => setMappings({ ...mappings, attributes: event.target.value })} placeholder="Orn: Renk -> Color, Beden -> Size" />
                </Field>
                <Field label="Minimum kar orani">
                  <input type="number" value={priceControls.minimum_profit_rate} onChange={(event) => setPriceControls({ ...priceControls, minimum_profit_rate: Number(event.target.value) })} />
                </Field>
                <label className="check-row"><input type="checkbox" checked={priceControls.include_shipping_cost} onChange={(event) => setPriceControls({ ...priceControls, include_shipping_cost: event.target.checked })} /> Kargo maliyetini dahil et</label>
              </div>
              {draft && (
                <div className={draft.status === 'blocked' ? 'state-box workflow-warning' : 'state-box success-empty'}>
                  <AlertTriangle size={18} />
                  <span>Aktarim #{draft.id}: {draftStatusLabel(draft.status)}. {draftMissingText(draft) || 'Kritik eksik yok.'}</span>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 6 / {steps.length}</span>
                <h2>Gonderim sonucu</h2>
                <p>Gonderim kuyruga alindiktan sonra batch sonucu ve pazaryeri hatalari aktarim listesi ile Hata Merkezi ekranindan izlenir.</p>
              </div>
              <div className="preview-grid">
                <div className="soft-empty"><strong>{draftStatusLabel(draft?.status)}</strong><span>Gonderim durumu</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.queued_product_count || draft?.product_ids?.length || 0}</strong><span>Kuyruga alinan urun</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.batch_request_id || draft?.id || '-'}</strong><span>Takip no</span></div>
                <div className="soft-empty"><strong>{draft?.result_summary?.message || draft?.error_message || 'Sonuc bekleniyor.'}</strong><span>Sonuc mesaji</span></div>
              </div>
              <div className="quick-fix-strip">
                <Link className="button-link secondary-link" to="/products/publish-queue">Aktarim listesine git</Link>
                <Link className="button-link secondary-link" to="/api-logs">Hata Merkezi</Link>
              </div>
            </>
          )}
        </div>

        <div className="wizard-actions">
          <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Geri</button>
          {step < 3 && <button type="button" disabled={(step === 0 && !marketplaceId) || (step === 1 && selectedProducts.length === 0)} onClick={() => setStep((current) => current + 1)}>Ileri <ChevronRight size={16} /></button>}
          {step === 3 && <button type="button" onClick={() => setStep(4)}>Ozete Gec <ChevronRight size={16} /></button>}
          {step === 4 && !draft && <button type="button" disabled={loading || selectedProducts.length === 0} onClick={validateDraft}><CheckCircle2 size={16} /> Kontrol Et ve Onizle</button>}
          {step === 4 && draft && <button type="button" disabled={loading || draft?.status === 'blocked'} onClick={sendDraft}><Send size={16} /> Pazaryerine Gonder</button>}
        </div>
      </section>
    </>
  );
}
