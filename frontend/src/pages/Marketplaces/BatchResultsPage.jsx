import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Eye, RefreshCcw, Search, Send, Timer } from 'lucide-react';
import { api, asArray } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function statusText(status) {
  if (status === 'queued') return 'Gonderildi';
  if (status === 'ready') return 'Hazir';
  if (status === 'blocked') return 'Eksik bilgi var';
  return status || '-';
}

function statusTone(status) {
  if (['queued', 'ready', 'success', 'completed'].includes(status)) return 'success';
  if (['failed', 'rejected', 'blocked'].includes(status)) return 'critical';
  if (['running', 'processing', 'pending'].includes(status)) return 'warning';
  return 'neutral';
}

function resultMessage(row) {
  return row.result_summary?.message || row.error_message || row.result_summary?.status || '-';
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function BatchResultsPage() {
  const { loading, error, run } = useAsync();
  const [drafts, setDrafts] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    await run(async () => {
      const response = await api.productPublish.drafts();
      const rows = asArray(response);
      setDrafts(rows);
      setSelectedId((current) => current || rows[0]?.id || null);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const marketplaces = useMemo(() => Array.from(new Set(drafts.map((item) => item.marketplace_code).filter(Boolean))), [drafts]);
  const filteredDrafts = useMemo(() => drafts.filter((draft) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [
      draft.id,
      draft.marketplace_code,
      draft.status,
      draft.result_summary?.batch_request_id,
      resultMessage(draft),
    ].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !statusFilter || draft.status === statusFilter;
    const matchesMarketplace = !marketplaceFilter || draft.marketplace_code === marketplaceFilter;
    return matchesSearch && matchesStatus && matchesMarketplace;
  }), [drafts, marketplaceFilter, search, statusFilter]);
  const selectedDraft = useMemo(() => drafts.find((draft) => draft.id === selectedId) || filteredDrafts[0] || null, [drafts, filteredDrafts, selectedId]);
  const successful = drafts.filter((draft) => ['queued', 'ready', 'success', 'completed'].includes(draft.status)).length;
  const blocked = drafts.filter((draft) => ['blocked', 'failed', 'rejected'].includes(draft.status)).length;
  const waiting = drafts.filter((draft) => ['running', 'processing', 'pending'].includes(draft.status)).length;

  return (
    <>
      <PageHeader
        title="Batch Sonuclari"
        description="Pazaryerine gonderilen urunlerin sonucunu sade ozet olarak takip edin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="marketplace" />

      <section className="batch-reference-hero">
        <div>
          <span>Pazaryeri aktarim takibi</span>
          <h2>Gonderim sonucunu, hata mesajini ve batch kimligini tek ekranda takip edin.</h2>
          <p>Urun gonderme sihirbazindan kuyruga alinan kayitlar burada izlenir; hata varsa ilgili duzeltme ekranina gecilir.</p>
        </div>
        <Link className="button-link" to="/products/publish-wizard"><Send size={18} /> Yeni Gonderim</Link>
      </section>

      <section className="batch-reference-summary">
        <div><CheckCircle2 size={20} /><span>Basarili/Hazir</span><strong>{successful}</strong><small>Gonderime uygun ya da tamamlanan</small></div>
        <div><Timer size={20} /><span>Bekleyen</span><strong>{waiting}</strong><small>Islemde veya sirada</small></div>
        <div><AlertTriangle size={20} /><span>Hata/Eksik</span><strong>{blocked}</strong><small>Kontrol gerektiren kayit</small></div>
        <div><ClipboardList size={20} /><span>Gorunen liste</span><strong>{filteredDrafts.length}</strong><small>Filtrelenmis sonuc</small></div>
      </section>

      <section className="batch-reference-filter">
        <div className="batch-reference-filter-title">
          <div>
            <span>Filtreleme</span>
            <strong>Batch sonucunu bulun</strong>
          </div>
          <small>Batch ID, pazaryeri, durum veya hata mesajina gore arama yapin.</small>
        </div>
        <div className="batch-reference-filter-grid">
          <label className="batch-reference-search">
            <span>Arama</span>
            <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Batch, hata veya pazaryeri ara" /></div>
          </label>
          <label>
            <span>Pazaryeri</span>
            <select value={marketplaceFilter} onChange={(event) => setMarketplaceFilter(event.target.value)}>
              <option value="">Tum pazaryerleri</option>
              {marketplaces.map((marketplace) => <option key={marketplace} value={marketplace}>{marketplace}</option>)}
            </select>
          </label>
          <label>
            <span>Durum</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tum durumlar</option>
              <option value="ready">Hazir</option>
              <option value="queued">Gonderildi</option>
              <option value="blocked">Eksik bilgi var</option>
              <option value="failed">Hatali</option>
              <option value="rejected">Reddedildi</option>
            </select>
          </label>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}

      <section className="batch-reference-layout">
        <div className="batch-reference-table">
          {loading && drafts.length === 0 ? <LoadingState /> : (
            <DataTable
              rows={filteredDrafts}
              emptyTitle="Aktarim sonucu yok"
              emptyText="Urunleri aktarim listesinden gonderdiginde sonuclar burada gorunur."
              columns={[
                { key: 'id', label: 'Kayit', render: (row) => <button type="button" className="admin-row-button" onClick={() => setSelectedId(row.id)}>#{row.id}</button> },
                { key: 'marketplace_code', label: 'Pazaryeri' },
                { key: 'status', label: 'Durum', render: (row) => <StatusPill tone={statusTone(row.status)}>{statusText(row.status)}</StatusPill> },
                { key: 'batch', label: 'Batch ID', render: (row) => row.result_summary?.batch_request_id || '-' },
                { key: 'result', label: 'Sonuc', render: (row) => resultMessage(row) },
                { key: 'actions', label: 'Islem', render: () => <Link className="button-link secondary-link" to="/products/publish-queue"><Eye size={14} /> Kuyruk</Link> },
              ]}
            />
          )}
        </div>

        <aside className="batch-reference-detail">
          {selectedDraft ? (
            <>
              <div className="batch-reference-detail-title">
                <span>Secili batch</span>
                <strong>Kayit #{selectedDraft.id}</strong>
                <StatusPill tone={statusTone(selectedDraft.status)}>{statusText(selectedDraft.status)}</StatusPill>
              </div>
              <div className="detail-grid two">
                <DetailItem label="Pazaryeri" value={selectedDraft.marketplace_code || '-'} />
                <DetailItem label="Batch ID" value={selectedDraft.result_summary?.batch_request_id || '-'} />
                <DetailItem label="Durum" value={statusText(selectedDraft.status)} />
                <DetailItem label="Tarih" value={formatDate(selectedDraft.updated_at || selectedDraft.created_at)} />
              </div>
              <div className="batch-reference-message">
                <span>Sonuc mesaji</span>
                <p>{resultMessage(selectedDraft)}</p>
              </div>
              <div className="batch-reference-actions">
                <Link className="button-link" to="/products/publish-queue">Aktarim Listesi</Link>
                <Link className="button-link secondary-link" to={`/api-logs?search=${encodeURIComponent(selectedDraft.result_summary?.batch_request_id || selectedDraft.id || '')}`}>Loglarda Ara</Link>
              </div>
            </>
          ) : (
            <SoftEmpty title="Sonuc secilmedi" text="Detay gormek icin listeden bir batch kaydi secin." />
          )}
        </aside>
      </section>
    </>
  );
}
