import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Layers3, Send } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { publishBlockReason } from './productWorkflow.js';

function draftMissingText(draft) {
  return Object.values(draft.readiness_report || {})
    .flatMap((report) => report?.missing_fields || [])
    .filter(Boolean)
    .join(', ');
}

function draftStatusLabel(draft) {
  if (draft.status === 'ready') return 'Hazir';
  if (draft.status === 'blocked') {
    const missing = draftMissingText(draft);
    if (missing.includes('category_mapping')) return 'Eksik kategori';
    if (missing.includes('required_attributes')) return 'Eksik ozellik';
    if (missing.includes('image')) return 'Eksik gorsel';
    if (missing.includes('price') || missing.includes('stock')) return 'Fiyat/stok hatasi';
    return 'Hata aldi';
  }
  if (draft.status === 'queued') return 'Gonderildi';
  return draft.status;
}

export function PublishQueuePage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [drafts, setDrafts] = useState([]);
  const [products, setProducts] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [previewDraft, setPreviewDraft] = useState(null);

  const selectedMarketplace = useMemo(() => marketplaces.find((marketplace) => String(marketplace.id) === String(marketplaceId)), [marketplaces, marketplaceId]);
  const readyDrafts = drafts.filter((draft) => ['ready', 'queued'].includes(draft.status));
  const blockedDrafts = drafts.filter((draft) => !['ready', 'queued'].includes(draft.status));

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
    setSelectedProducts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleDraft = (id) => {
    setSelectedDrafts((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const createDraft = async () => {
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
    await run(async () => {
      const response = await api.productPublish.send(draftId);
      setPreviewDraft(response);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Gonderim kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendSelectedDrafts = async () => {
    await Promise.all(selectedDrafts.map((draftId) => sendDraft(draftId)));
    setSelectedDrafts([]);
  };

  return (
    <>
      <PageHeader
        title="Pazaryeri Aktarim Listesi"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/products/category-mapping"><Layers3 size={16} /> Kategori Esle</Link>
            <Link className="button-link" to="/products/publish"><Send size={16} /> Gonderim Sihirbazi</Link>
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
            <button type="button" disabled={loading} onClick={createDraft}><CheckCircle2 size={16} /> Onizle ve Listeye Ekle</button>
          </div>
          <DataTable
            rows={products}
            emptyTitle="Urun yok"
            emptyText="Aktarim listesine almak icin once urun ekleyin."
            columns={[
              { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedProducts.includes(row.id)} onChange={() => toggleProduct(row.id)} /> },
              { key: 'name', label: 'Urun' },
              { key: 'sku', label: 'SKU' },
              { key: 'category', label: 'Kategori' },
              { key: 'status', label: 'Durum', render: (row) => <span className={row.marketplace_ready ? 'status-pill ready' : 'status-pill blocked'}>{publishBlockReason(row)}</span> },
            ]}
          />
        </section>

        <section className="panel compact-panel">
          <h2>Gonderim Onizleme</h2>
          {previewDraft ? (
            <>
              <div className="soft-empty"><strong>Aktarim #{previewDraft.id}</strong><span>{draftStatusLabel(previewDraft)}</span></div>
              <pre className="json-preview">{JSON.stringify(previewDraft.payload_preview || previewDraft.result_summary || previewDraft.readiness_report, null, 2)}</pre>
            </>
          ) : (
            <div className="soft-empty">Urunleri secip listeye eklediginde gonderim onizlemesi burada gorunur.</div>
          )}
        </section>
      </section>

      {selectedDrafts.length > 0 && (
        <section className="state-box bulk-action-bar">
          <span>{selectedDrafts.length} aktarim kaydi secildi.</span>
          <button type="button" disabled={loading} onClick={sendSelectedDrafts}><Send size={16} /> Secilenleri Gonder</button>
        </section>
      )}

      <section className="publish-columns">
        <div className="panel compact-panel">
          <h2>Gonderime Hazir Urunler</h2>
          <span className="muted-text">{readyDrafts.length} aktarim kaydi hazir veya gonderildi.</span>
        </div>
        <div className="panel compact-panel">
          <h2>Duzeltilmesi Gerekenler</h2>
          <span className="muted-text">{blockedDrafts.length} aktarim kaydi eksik bilgi bekliyor.</span>
        </div>
      </section>

      <section className="panel">
        <h2>Aktarim Listesi ve Sonuclar</h2>
        <DataTable
          rows={drafts}
          emptyTitle="Aktarim kaydi yok"
          emptyText="Urun listesi veya bu ekran uzerinden urunleri aktarim listesine alin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedDrafts.includes(row.id)} onChange={() => toggleDraft(row.id)} /> },
            { key: 'id', label: 'Kayit' },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
            { key: 'status', label: 'Durum', render: (row) => <span className={row.status === 'ready' || row.status === 'queued' ? 'status-pill ready' : 'status-pill blocked'}>{draftStatusLabel(row)}</span> },
            { key: 'products', label: 'Urun', render: (row) => row.product_ids?.length || 0 },
            { key: 'missing', label: 'Eksikler', render: (row) => draftMissingText(row) || '-' },
            { key: 'batch', label: 'Pazaryeri Sonucu', render: (row) => row.result_summary?.batch_request_id || row.result_summary?.message || '-' },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => (
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => setPreviewDraft(row)}>Onizle</button>
                  <button type="button" disabled={loading || row.status === 'blocked'} onClick={() => sendDraft(row.id)}><Send size={15} /> Gonder</button>
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
