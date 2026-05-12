import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Send } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const steps = ['Urun Secimi', 'Pazaryeri', 'Esleme', 'Fiyat Kontrol', 'Kontrol', 'Onizleme', 'Gonderim'];

function missingText(report) {
  return Object.values(report || {})
    .flatMap((item) => item?.missing_fields || [])
    .filter(Boolean)
    .join(', ');
}

export function ProductPublishWizardPage() {
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

  const selectedMarketplace = useMemo(
    () => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)),
    [marketplaces, marketplaceId],
  );

  const selectedRows = useMemo(
    () => products.filter((product) => selectedProducts.includes(product.id)),
    [products, selectedProducts],
  );

  const load = async () => {
    await run(async () => {
      const [productResponse, marketplaceResponse] = await Promise.all([api.products.list(), api.marketplaces.list()]);
      setProducts(productResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleProduct = (id) => {
    setSelectedProducts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const fetchRequiredAttributes = async () => {
    if (selectedMarketplace?.code !== 'trendyol') return;
    const categoryId = mappings.category_id || selectedRows[0]?.trendyol_category_id;
    if (!categoryId) {
      setRequiredAttributes([]);
      return;
    }
    await run(async () => {
      const response = await api.marketplaces.trendyolCategoryAttributes(selectedMarketplace.id, categoryId);
      const attributes = (response.attributes || response.raw?.categoryAttributes || []).filter((item) => item.required);
      setRequiredAttributes(attributes);
      notify('success', `${attributes.length} zorunlu Trendyol ozelligi bulundu.`);
    }, { onError: (message) => notify('error', message) });
  };

  const missingRequiredAttributes = () => {
    if (selectedMarketplace?.code !== 'trendyol' || requiredAttributes.length === 0) return [];
    return selectedRows.flatMap((product) => {
      const productAttributes = product.trendyol_attributes || [];
      const sentIds = productAttributes.map((attribute) => String(attribute.attributeId || attribute.attribute?.id));
      return requiredAttributes
        .filter((attribute) => !sentIds.includes(String(attribute.attributeId || attribute.attribute?.id)))
        .map((attribute) => `${product.sku}: ${attribute.attributeName || attribute.attribute?.name || attribute.attributeId}`);
    });
  };

  const validateDraft = async () => {
    if (!marketplaceId || selectedProducts.length === 0) {
      setError('Urun ve pazaryeri secimi zorunludur.');
      return;
    }
    const missingAttributes = missingRequiredAttributes();
    if (missingAttributes.length > 0) {
      const message = `Trendyol zorunlu ozellikleri eksik: ${missingAttributes.slice(0, 5).join(', ')}`;
      setError(message);
      notify('error', message);
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
      setStep(5);
      notify(response.status === 'blocked' ? 'error' : 'success', response.status === 'blocked' ? 'Eksik alanlar bulundu.' : 'Gonderim onizlemesi hazir.');
    }, { onError: (message) => notify('error', message) });
  };

  const sendDraft = async () => {
    if (!draft?.id) return;
    await run(async () => {
      const response = await api.productPublish.send(draft.id);
      setDraft(response);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Gonderim kuyruga alindi.');
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Pazaryerine Urun Gonderme Sihirbazi" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : null}
      <section className="panel wizard-panel">
        <div className="wizard-steps">
          {steps.map((label, index) => (
            <button type="button" className={index === step ? 'wizard-step active' : 'wizard-step'} key={label} onClick={() => setStep(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        {step === 0 && (
          <DataTable
            rows={products}
            emptyTitle="Gonderilecek urun yok"
            emptyText="Once urun ekleme sihirbazi ile urun olusturun."
            columns={[
              { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedProducts.includes(row.id)} onChange={() => toggleProduct(row.id)} /> },
              { key: 'name', label: 'Urun' },
              { key: 'sku', label: 'SKU' },
              { key: 'ready', label: 'Hazirlik', render: (row) => <span className={row.marketplace_ready ? 'status-pill ready' : 'status-pill blocked'}>{row.marketplace_ready ? 'Hazir' : 'Eksik'}</span> },
              { key: 'missing', label: 'Eksikler', render: (row) => missingText(row.marketplace_readiness) || '-' },
            ]}
          />
        )}

        {step === 1 && (
          <div className="form-grid">
            <Field label="Pazaryeri Hesabi">
              <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
                <option value="">Seciniz</option>
                {marketplaces.map((marketplace) => (
                  <option key={marketplace.id} value={marketplace.id}>{marketplace.name} ({marketplace.code})</option>
                ))}
              </select>
            </Field>
            <div className="soft-empty"><strong>{selectedProducts.length} urun secildi</strong><span>{selectedMarketplace?.name || 'Pazaryeri secilmedi'}</span></div>
          </div>
        )}

        {step === 2 && (
          <div className="form-grid">
            <Field label="Kategori Esleme"><input value={mappings.category_id} onChange={(event) => setMappings({ ...mappings, category_id: event.target.value })} /></Field>
            <Field label="Ozellik Esleme JSON"><textarea value={mappings.attributes} onChange={(event) => setMappings({ ...mappings, attributes: event.target.value })} placeholder='{"renk":"Renk","beden":"Beden"}' /></Field>
            {selectedMarketplace?.code === 'trendyol' && <button type="button" disabled={loading} onClick={fetchRequiredAttributes}>Trendyol Zorunlu Ozellikleri Getir</button>}
            {requiredAttributes.length > 0 && (
              <div className="soft-empty">
                <strong>{requiredAttributes.length} zorunlu ozellik</strong>
                <span>{requiredAttributes.slice(0, 8).map((item) => item.attributeName || item.attribute?.name || item.attributeId).join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="form-grid">
            <Field label="Minimum Kar Orani"><input type="number" value={priceControls.minimum_profit_rate} onChange={(event) => setPriceControls({ ...priceControls, minimum_profit_rate: Number(event.target.value) })} /></Field>
            <label className="check-row"><input type="checkbox" checked={priceControls.include_shipping_cost} onChange={(event) => setPriceControls({ ...priceControls, include_shipping_cost: event.target.checked })} /> Kargo maliyetini dahil et</label>
          </div>
        )}

        {step === 4 && (
          <div className="preview-grid">
            {selectedRows.map((product) => (
              <div className="soft-empty" key={product.id}>
                <strong>{product.name}</strong>
                <span>{missingRequiredAttributes().some((item) => item.startsWith(`${product.sku}:`)) ? 'Trendyol zorunlu ozellik eksigi var.' : (product.marketplace_ready ? 'Genel pazaryeri kontrolleri tamam.' : missingText(product.marketplace_readiness) || 'Readiness kontrolu bekleniyor.')}</span>
              </div>
            ))}
          </div>
        )}

        {step === 5 && (
          <div className="preview-grid">
            {draft ? (
              <>
                <div className="soft-empty"><strong>Draft #{draft.id}</strong><span>{draft.status}</span></div>
                <div className="soft-empty"><strong>{draft.marketplace_code}</strong><span>{selectedProducts.length} urun</span></div>
                <div className="soft-empty"><strong>Eksikler</strong><span>{missingText(draft.readiness_report) || 'Kritik eksik yok'}</span></div>
              </>
            ) : (
              <div className="soft-empty"><strong>Onizleme hazir degil</strong><span>Kontrol butonu ile pazaryeri validasyonunu calistirin.</span></div>
            )}
          </div>
        )}

        {step === 6 && (
          <div className="preview-grid">
            <div className="soft-empty"><strong>Sonuc</strong><span>{draft?.result_summary?.message || draft?.error_message || 'Gonderim bekliyor.'}</span></div>
            <div className="soft-empty"><strong>API Log</strong><span>Gonderim sonrasi pazaryeri joblari API log ekraninda izlenir.</span></div>
          </div>
        )}

        <div className="wizard-actions">
          <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Geri</button>
          {step < 4 && <button type="button" onClick={() => setStep((current) => current + 1)}>Ileri <ChevronRight size={16} /></button>}
          {step === 4 && <button type="button" disabled={loading} onClick={validateDraft}><CheckCircle2 size={16} /> Validasyon ve Onizleme</button>}
          {step === 5 && <button type="button" disabled={loading || draft?.status === 'blocked'} onClick={() => { setStep(6); sendDraft(); }}><Send size={16} /> Pazaryerine Gonder</button>}
        </div>
      </section>
    </>
  );
}
