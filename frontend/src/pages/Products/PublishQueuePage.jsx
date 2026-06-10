import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, RefreshCw, Send } from 'lucide-react';
import { api } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { missingLabel } from './productWorkflow.js';

function draftMissingFields(draft) {
  return Object.values(draft?.readiness_report || {})
    .flatMap((report) => report?.missing_fields || [])
    .filter(Boolean);
}

function draftMissingText(draft) {
  const missing = draftMissingFields(draft).map((field) => `${missingLabel(field)} eksik`);
  return [...new Set(missing)].join(', ');
}

function statusLabel(status) {
  if (status === 'ready') return 'queued';
  if (status === 'queued') return 'queued';
  if (status === 'running') return 'running';
  if (status === 'completed') return 'success';
  if (status === 'success') return 'success';
  if (status === 'failed') return 'failed';
  if (status === 'rejected') return 'rejected';
  if (status === 'blocked') return 'rejected';
  return status || '-';
}

function statusClass(status) {
  const normalized = statusLabel(status);
  if (['success', 'queued', 'running'].includes(normalized)) return 'status-pill ready';
  if (['failed', 'rejected'].includes(normalized)) return 'status-pill blocked';
  return 'status-pill';
}

function fixTarget(missing = []) {
  if (missing.includes('category_mapping') || missing.includes('marketplace_category')) {
    return { href: '/marketplace-mapping/categories', label: 'Kategori eslestir' };
  }
  if (missing.includes('brand')) {
    return { href: '/marketplace-mapping/brands', label: 'Marka eslestir' };
  }
  if (missing.includes('attributes') || missing.includes('required_attributes')) {
    return { href: '/marketplace-mapping/attributes', label: 'Nitelik eslestir' };
  }
  if (missing.includes('variant_attributes')) {
    return { href: '/marketplace-mapping/variants', label: 'Varyant eslestir' };
  }
  return { href: '/api-logs', label: 'Hata detaylari' };
}

export function PublishQueuePage() {
  const { notify, user } = useApp();
  const { loading, error, run } = useAsync();
  const [drafts, setDrafts] = useState([]);
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedDraft, setSelectedDraft] = useState(null);

  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');

  const load = async () => {
    await run(async () => {
      const draftResponse = await api.productPublish.drafts();
      setDrafts(draftResponse.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredDrafts = useMemo(() => drafts.filter((draft) => {
    const matchesMarketplace = !marketplaceFilter || draft.marketplace_code === marketplaceFilter;
    const matchesStatus = !statusFilter || statusLabel(draft.status) === statusFilter;
    return matchesMarketplace && matchesStatus;
  }), [drafts, marketplaceFilter, statusFilter]);

  const statusCounts = useMemo(() => drafts.reduce((counts, draft) => {
    const status = statusLabel(draft.status);
    return { ...counts, [status]: (counts[status] || 0) + 1 };
  }, {}), [drafts]);

  const retryDraft = async (draftId) => {
    if (!canSendMarketplaces) return;
    await run(async () => {
      const response = await api.productPublish.send(draftId);
      setSelectedDraft(response);
      notify(response.status === 'blocked' ? 'error' : 'success', response.error_message || 'Aktarim yeniden kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader
        title="Gonderim Kuyrugu"
        description="Bu ekran sadece kuyruk ve sonuc izleme icindir. Urun secimi ve mapping duzenleme urun gonderme sihirbazi ile mapping sayfalarinda yapilir."
        actions={(
          <>
            <Link className="button-link secondary-link" to="/marketplace-readiness"><CheckCircle2 size={16} /> Hazirlik Merkezi</Link>
            {canSendMarketplaces && <Link className="button-link" to="/products/publish-wizard"><Send size={16} /> Urun Gonder</Link>}
          </>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && drafts.length === 0 ? <LoadingState /> : null}

      <section className="queue-status-grid">
        {['queued', 'running', 'success', 'failed', 'rejected'].map((status) => (
          <button type="button" className={statusFilter === status ? 'queue-status-card active' : 'queue-status-card'} key={status} onClick={() => setStatusFilter(statusFilter === status ? '' : status)}>
            <span>{status}</span>
            <strong>{statusCounts[status] || 0}</strong>
          </button>
        ))}
      </section>

      <section className="mapping-center-shell queue-monitor-shell">
        <aside className="mapping-filter-panel">
          <div className="mapping-filter-heading">
            <ClipboardList size={18} />
            <strong>Filtreler</strong>
          </div>
          <select value={marketplaceFilter} onChange={(event) => setMarketplaceFilter(event.target.value)}>
            <option value="">Tum pazaryerleri</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tum durumlar</option>
            <option value="queued">queued</option>
            <option value="running">running</option>
            <option value="success">success</option>
            <option value="failed">failed</option>
            <option value="rejected">rejected</option>
          </select>
          <button type="button" className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} /> Yenile</button>
          <div className="mapping-next-card">
            <strong>Simdi ne yapmaliyim?</strong>
            <span>Yeni urun gondermek icin wizard'a gidin; failed/rejected kayitlarda once hata mesajini okuyun.</span>
            <Link className="button-link secondary-link" to="/products/publish-wizard">Urun gonderme sihirbazi</Link>
          </div>
        </aside>

        <main className="mapping-table-panel">
          <DataTable
            rows={filteredDrafts}
            emptyTitle="Gonderim kaydi yok"
            emptyText="Kuyruga alinan urunler burada listelenir."
            columns={[
              { key: 'id', label: 'Kayit' },
              { key: 'batch', label: 'Batch ID', render: (row) => row.result_summary?.batch_request_id || row.id || '-' },
              { key: 'marketplace_code', label: 'Pazaryeri', render: (row) => row.marketplace_code || '-' },
              { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
              { key: 'status', label: 'Durum', render: (row) => <span className={statusClass(row.status)}>{statusLabel(row.status)}</span> },
              { key: 'products', label: 'Urun', render: (row) => row.product_ids?.length || 0 },
              { key: 'error', label: 'Hata mesaji', render: (row) => row.error_message || draftMissingText(row) || row.result_summary?.message || '-' },
              {
                key: 'actions',
                label: 'Islem',
                render: (row) => (
                  <div className="row-actions">
                    <button type="button" className="secondary-button" onClick={() => setSelectedDraft(row)}>Detay</button>
                    {canSendMarketplaces && ['failed', 'rejected'].includes(statusLabel(row.status)) && <button type="button" onClick={() => retryDraft(row.id)}><Send size={15} /> Retry</button>}
                  </div>
                ),
              },
            ]}
          />
        </main>

        <aside className="mapping-detail-panel">
          <div className="mapping-detail-heading">
            <div>
              <span>Detay Paneli</span>
              <strong>{selectedDraft ? `Kayit #${selectedDraft.id}` : 'Kayit secin'}</strong>
            </div>
          </div>
          {selectedDraft ? (
            <div className="queue-detail-stack">
              <div className="mapping-ready-card">
                <strong>{['failed', 'rejected'].includes(statusLabel(selectedDraft.status)) ? <AlertTriangle size={28} /> : <CheckCircle2 size={28} />}</strong>
                <span>{statusLabel(selectedDraft.status)}</span>
              </div>
              <div className="detail-grid compact-detail-grid">
                <div className="detail-card"><span>Batch</span><strong>{selectedDraft.result_summary?.batch_request_id || selectedDraft.id || '-'}</strong></div>
                <div className="detail-card"><span>Pazaryeri</span><strong>{selectedDraft.marketplace_code || '-'}</strong></div>
                <div className="detail-card"><span>Urun</span><strong>{selectedDraft.product_ids?.length || 0}</strong></div>
                <div className="detail-card"><span>Durum</span><strong>{statusLabel(selectedDraft.status)}</strong></div>
              </div>
              <div className="soft-empty"><strong>Hata / sonuc</strong><span>{selectedDraft.error_message || draftMissingText(selectedDraft) || selectedDraft.result_summary?.message || 'Hata mesaji yok.'}</span></div>
              {draftMissingFields(selectedDraft).length > 0 && (
                <Link className="button-link secondary-link" to={fixTarget(draftMissingFields(selectedDraft)).href}>{fixTarget(draftMissingFields(selectedDraft)).label}</Link>
              )}
            </div>
          ) : (
            <div className="soft-empty">Bir kuyruk kaydi secildiginde batch, durum ve hata detaylari burada gorunur.</div>
          )}
        </aside>
      </section>
    </>
  );
}
