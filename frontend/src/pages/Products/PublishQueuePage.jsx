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
    return { href: '/marketplace-mapping?step=category', label: 'Kategori eslestir' };
  }
  if (missing.includes('brand') || missing.includes('brand_mapping')) {
    return { href: '/marketplace-mapping?step=attribute', label: 'Marka bilgisini tamamla' };
  }
  if (missing.includes('attributes') || missing.includes('required_attributes') || missing.includes('attribute_mappings')) {
    return { href: '/marketplace-mapping?step=attribute', label: 'Ozellik eslestir' };
  }
  if (missing.includes('variant_attributes') || missing.includes('variant_attribute_mappings')) {
    return { href: '/marketplace-mapping?step=variant', label: 'Varyant eslestir' };
  }
  return { href: '/api-logs', label: 'Hata detaylari' };
}

function missingFromMessage(message = '') {
  const text = String(message).toLocaleLowerCase('tr-TR');
  if (text.includes('kategori')) return ['category_mapping'];
  if (text.includes('varyant')) return ['variant_attribute_mappings'];
  if (text.includes('marka')) return ['brand_mapping'];
  if (text.includes('nitelik') || text.includes('ozellik') || text.includes('özellik') || text.includes('attribute')) return ['attribute_mappings'];
  return [];
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
        title="Pazaryeri Monitoru"
        description="Pazaryeri gonderim hatalarini, bekleyen islemleri ve cozum adimlarini tek ekrandan takip edin."
        actions={(
          <>
            <Link className="button-link secondary-link" to="/marketplace-mapping"><CheckCircle2 size={16} /> Pazaryeri Eslestirmeleri</Link>
            {canSendMarketplaces && <Link className="button-link" to="/products/publish-wizard"><Send size={16} /> Yeni Pazaryeri Islemi</Link>}
          </>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && drafts.length === 0 ? <LoadingState /> : null}

      <section className="monitor-kpi-strip">
        <div className="success"><span>Basarili</span><strong>{statusCounts.success || 0}</strong></div>
        <div className="pending"><span>Bekleyen</span><strong>{(statusCounts.queued || 0) + (statusCounts.running || 0)}</strong></div>
        <div className="danger"><span>Hatali</span><strong>{(statusCounts.failed || 0) + (statusCounts.rejected || 0)}</strong></div>
      </section>

      <section className="queue-monitor-simple">
        <header className="bulk-operation-toolbar">
          <div className="mapping-filter-heading">
            <ClipboardList size={18} />
            <strong>Islem gecmisi</strong>
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
        </header>

        <DataTable
          rows={filteredDrafts}
          emptyTitle="Gonderim kaydi yok"
          emptyText="Kuyruga alinan islemler burada listelenir."
          columns={[
            { key: 'id', label: 'Islem gecmisi', render: (row) => `#${row.id}` },
            { key: 'batch', label: 'Batch ID', render: (row) => row.result_summary?.batch_request_id || row.id || '-' },
            { key: 'status', label: 'Durum', render: (row) => <span className={statusClass(row.status)}>{statusLabel(row.status)}</span> },
            { key: 'marketplace_code', label: 'Pazaryeri', render: (row) => row.marketplace_code || '-' },
            { key: 'error', label: 'Hata mesaji', render: (row) => row.error_message || draftMissingText(row) || row.result_summary?.message || '-' },
            { key: 'created_at', label: 'Islem zamani', render: (row) => row.created_at ? new Date(row.created_at).toLocaleString('tr-TR') : '-' },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => (
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => setSelectedDraft(row)}>Detay</button>
                  {['failed', 'rejected'].includes(statusLabel(row.status)) && (() => {
                    const target = fixTarget([...draftMissingFields(row), ...missingFromMessage(row.error_message || row.result_summary?.message)]);
                    return <Link className="table-action-link" to={target.href}>{target.label}</Link>;
                  })()}
                  {canSendMarketplaces && ['failed', 'rejected'].includes(statusLabel(row.status)) && <button type="button" onClick={() => retryDraft(row.id)}><Send size={15} /> Tekrar dene</button>}
                </div>
              ),
            },
          ]}
        />
        {selectedDraft && (
          <div className="soft-empty monitor-detail-line">
            <strong>Detay #{selectedDraft.id}</strong>
            <span>{selectedDraft.error_message || draftMissingText(selectedDraft) || selectedDraft.result_summary?.message || 'Hata mesaji yok.'}</span>
          </div>
        )}
      </section>
    </>
  );
}
