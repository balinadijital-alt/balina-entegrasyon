import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Eye, FileWarning, RefreshCcw, Search, ShieldAlert, Timer } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const sensitiveKeys = ['password', 'secret', 'api_secret', 'token', 'authorization', 'api_key', 'service_password', 'supplier_id', 'merchant_id'];

const statusDictionary = {
  400: { title: 'Gecersiz istek', message: 'Gonderilen veri formatinda eksik veya hatali alan olabilir.', action: 'Istek verisini kontrol edin.' },
  401: { title: 'Yetki/API bilgisi hatasi', message: 'API key, secret, token veya kullanici bilgisi hatali olabilir.', action: 'Pazaryeri baglanti bilgilerini test edin.' },
  403: { title: 'Erisim izni yok', message: 'Hesabin bu islem icin yetkisi olmayabilir.', action: 'Pazaryeri panelindeki yetkileri kontrol edin.' },
  404: { title: 'Endpoint veya kaynak bulunamadi', message: 'Istenen kaynak veya endpoint pazaryeri tarafinda bulunamadi.', action: 'Kategori, urun veya siparis kodunu kontrol edin.' },
  422: { title: 'Eksik/gecersiz veri', message: 'Urun, kategori, fiyat, stok veya zorunlu nitelik bilgisi eksik olabilir.', action: 'Eksik alanlari tamamlayip tekrar deneyin.' },
  429: { title: 'Rate limit', message: 'Servis kisa surede cok fazla istek aldigi icin yavaslatma uyguladi.', action: 'Bir sure bekleyip islemi tekrar deneyin.' },
};

function serviceType(log) {
  const endpoint = String(log.endpoint || '').toLowerCase();
  const marketplace = String(log.marketplace_code || '').toLowerCase();
  if (marketplace.includes('trendyol') || endpoint.includes('trendyol')) return 'trendyol';
  if (marketplace.includes('hepsiburada') || endpoint.includes('hepsiburada')) return 'hepsiburada';
  if (endpoint.includes('shipment') || endpoint.includes('shipping') || endpoint.includes('cargo') || endpoint.includes('kargo')) return 'kargo';
  if (endpoint.includes('payment') || endpoint.includes('pos') || endpoint.includes('pay')) return 'odeme';
  if (endpoint.includes('import') || endpoint.includes('xml') || endpoint.includes('excel')) return 'import';
  if (endpoint.includes('invoice') || endpoint.includes('accounting') || endpoint.includes('current')) return 'muhasebe';
  return 'platform';
}

function serviceLabel(value) {
  return {
    trendyol: 'Trendyol',
    hepsiburada: 'Hepsiburada',
    kargo: 'Kargo',
    odeme: 'Odeme/POS',
    import: 'Import',
    muhasebe: 'Muhasebe',
    platform: 'Platform',
  }[value] || value || '-';
}

function dictionaryFor(log) {
  const status = Number(log.status_code || 0);
  const endpoint = String(log.endpoint || '').toLowerCase();
  const responseText = JSON.stringify(log.response_payload || {}).toLowerCase();
  const base = statusDictionary[status] || (status >= 500
    ? { title: 'Servis/saglayici hatasi', message: 'Karsi servis gecici veya kalici hata dondu.', action: 'Servis durumunu kontrol edip tekrar deneyin.' }
    : status >= 400
      ? { title: 'Islem kontrol edilmeli', message: 'Servis isleme hata dondu.', action: 'Detaydaki veri ve endpoint bilgisini kontrol edin.' }
      : { title: 'Basarili islem', message: 'API cagrisi basarili tamamlandi.', action: 'Ek aksiyon gerekmez.' });

  if (endpoint.includes('category') || responseText.includes('category')) {
    return { ...base, title: 'Kategori eslesmesi kontrol edilmeli', message: 'Pazaryeri kategori kodu veya kategori eslesmesi eksik olabilir.', action: 'Kategori eslestirme ekranindan kontrol edin.' };
  }
  if (endpoint.includes('product') || responseText.includes('barcode') || responseText.includes('attribute')) {
    return { ...base, title: 'Urun verisi kontrol edilmeli', message: 'Barkod, marka, kategori, gorsel veya zorunlu nitelik eksik olabilir.', action: 'Urunu duzenleyip hazirlik kontrolunu yenileyin.' };
  }
  if (endpoint.includes('image') || responseText.includes('image')) {
    return { ...base, title: 'Gorsel zorunlu veya hatali', message: 'Pazaryeri gorsel URL veya dosya bilgisini kabul etmedi.', action: 'Urun gorsellerini kontrol edin.' };
  }

  return base;
}

function fixLink(log) {
  const endpoint = String(log.endpoint || '').toLowerCase();
  const service = serviceType(log);
  if (endpoint.includes('category')) return '/products/category-mapping';
  if (endpoint.includes('product') || endpoint.includes('image')) return '/products';
  if (service === 'trendyol' || service === 'hepsiburada') return `/marketplaces/${service}`;
  if (service === 'import') return '/products/import';
  if (service === 'kargo') return '/shipping';
  if (service === 'odeme') return '/payments';
  if (service === 'muhasebe') return '/accounting';
  return '/operations';
}

function statusTone(status) {
  const code = Number(status || 0);
  if (code >= 500) return 'critical';
  if (code >= 400) return 'failed';
  if (code >= 300) return 'warning';
  return 'success';
}

function maskValue(value, key = '') {
  if (sensitiveKeys.some((item) => String(key).toLowerCase().includes(item))) return '••••••';
  if (Array.isArray(value)) return value.map((item) => maskValue(item));
  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((carry, [childKey, childValue]) => ({ ...carry, [childKey]: maskValue(childValue, childKey) }), {});
  }
  return value;
}

function jsonSummary(payload) {
  if (!payload) return '-';
  if (Array.isArray(payload)) return `${payload.length} kayit`;
  if (typeof payload === 'object') return `${Object.keys(payload).length} alan`;
  return String(payload).slice(0, 120);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function ApiLogsPage() {
  const { loading, error, run } = useAsync();
  const [logs, setLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [filters, setFilters] = useState({
    search: '',
    service: '',
    marketplace: '',
    status: '',
    result: 'failed',
    from: '',
    to: '',
  });

  const load = async () => {
    await run(async () => {
      const response = await api.logs.list();
      const rows = response.data || [];
      setLogs(rows);
      setSelectedLog((current) => current || rows.find((log) => Number(log.status_code || 0) >= 400) || rows[0] || null);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredLogs = useMemo(() => logs.filter((log) => {
    const query = filters.search.trim().toLowerCase();
    const status = Number(log.status_code || 0);
    const date = log.created_at ? new Date(log.created_at) : null;
    const matchesSearch = !query || [log.marketplace_code, log.method, log.endpoint, log.status_code, log.error_message, JSON.stringify(log.response_payload || {})].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesService = !filters.service || serviceType(log) === filters.service;
    const matchesMarketplace = !filters.marketplace || String(log.marketplace_code || '').toLowerCase() === filters.marketplace;
    const matchesStatus = !filters.status || String(status).startsWith(filters.status);
    const matchesResult = !filters.result || (filters.result === 'failed' ? status >= 400 : status < 400);
    const matchesFrom = !filters.from || (date && date >= new Date(`${filters.from}T00:00:00`));
    const matchesTo = !filters.to || (date && date <= new Date(`${filters.to}T23:59:59`));
    return matchesSearch && matchesService && matchesMarketplace && matchesStatus && matchesResult && matchesFrom && matchesTo;
  }), [logs, filters]);

  const failedCount = logs.filter((log) => Number(log.status_code || 0) >= 400).length;
  const successCount = Math.max(0, logs.length - failedCount);
  const criticalLog = logs.find((log) => Number(log.status_code || 0) >= 500) || logs.find((log) => Number(log.status_code || 0) >= 400);
  const selectedDictionary = selectedLog ? dictionaryFor(selectedLog) : null;
  const successRate = logs.length === 0 ? 100 : Math.round((successCount / logs.length) * 100);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <PageHeader
        title="Hata Merkezi"
        description="API loglarini operasyon mesajlariyla inceleyin, kritik hatalari filtreleyin ve ilgili duzeltme ekranina hizli gecin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && logs.length === 0 ? <LoadingState /> : null}

      <section className="log-kpi-grid">
        <div className="log-kpi-card success"><CheckCircle2 size={19} /><span>Basarili</span><strong>{successCount}</strong><small>{successRate}% basari orani</small></div>
        <div className="log-kpi-card failed"><FileWarning size={19} /><span>Hatali</span><strong>{failedCount}</strong><small>HTTP 400 ve uzeri</small></div>
        <div className="log-kpi-card warning"><Timer size={19} /><span>Ortalama sure</span><strong>{logs.length ? Math.round(logs.reduce((sum, log) => sum + Number(log.duration_ms || 0), 0) / logs.length) : 0} ms</strong><small>Kayitli cagrilar</small></div>
        <div className="log-kpi-card critical"><ShieldAlert size={19} /><span>Son kritik hata</span><strong>{criticalLog ? `HTTP ${criticalLog.status_code}` : 'Yok'}</strong><small>{criticalLog ? serviceLabel(serviceType(criticalLog)) : 'Kritik hata yok'}</small></div>
      </section>

      <section className="panel log-filter-panel">
        <div className="compact-filter-heading">
          <strong>Log filtreleri</strong>
          <span>Servis, pazaryeri, durum kodu, sonuc, tarih ve metin aramasi ile daraltin.</span>
        </div>
        <div className="log-filter-grid">
          <label className="search-field"><Search size={15} /><input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Endpoint, hata mesaji veya payload ara" /></label>
          <select value={filters.service} onChange={(event) => setFilter('service', event.target.value)}>
            <option value="">Tum servisler</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
            <option value="kargo">Kargo</option>
            <option value="odeme">Odeme/POS</option>
            <option value="import">Import</option>
            <option value="muhasebe">Muhasebe</option>
            <option value="platform">Platform</option>
          </select>
          <select value={filters.marketplace} onChange={(event) => setFilter('marketplace', event.target.value)}>
            <option value="">Tum pazaryerleri</option>
            <option value="trendyol">Trendyol</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
          <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
            <option value="">Tum HTTP durumlari</option>
            <option value="2">2xx Basarili</option>
            <option value="4">4xx Kullanici/veri hatasi</option>
            <option value="5">5xx Servis hatasi</option>
          </select>
          <select value={filters.result} onChange={(event) => setFilter('result', event.target.value)}>
            <option value="">Tum sonuclar</option>
            <option value="failed">Basarisiz</option>
            <option value="success">Basarili</option>
          </select>
          <input type="date" value={filters.from} onChange={(event) => setFilter('from', event.target.value)} />
          <input type="date" value={filters.to} onChange={(event) => setFilter('to', event.target.value)} />
        </div>
      </section>

      <section className="log-viewer-layout">
        <section className="panel">
          <h2>Log Kayitlari</h2>
          <DataTable
            rows={filteredLogs}
            emptyTitle="Log kaydi yok"
            emptyText="Filtreleri temizleyin veya entegrasyon islemlerinden sonra tekrar kontrol edin."
            columns={[
              { key: 'service', label: 'Servis', render: (row) => <span className="log-service-label">{serviceLabel(serviceType(row))}</span> },
              { key: 'endpoint', label: 'Endpoint', render: (row) => <div className="table-product-title"><strong>{row.method || 'GET'}</strong><span>{row.endpoint || '-'}</span></div> },
              { key: 'status_code', label: 'Status', render: (row) => <span className={`status-pill ${statusTone(row.status_code)}`}>HTTP {row.status_code || '-'}</span> },
              { key: 'duration_ms', label: 'Sure', render: (row) => `${row.duration_ms || 0} ms` },
              { key: 'message', label: 'Operasyon Mesaji', render: (row) => dictionaryFor(row).title },
              { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.created_at) },
              { key: 'actions', label: 'Islem', render: (row) => <button type="button" className="secondary-button" onClick={() => setSelectedLog(row)}><Eye size={15} /> Detay</button> },
            ]}
          />
        </section>

        <aside className="panel log-detail-panel">
          <div className="section-title-row">
            <h2>Log Detayi</h2>
            {selectedLog && <span className={`status-pill ${statusTone(selectedLog.status_code)}`}>HTTP {selectedLog.status_code}</span>}
          </div>
          {!selectedLog ? (
            <div className="soft-empty">Detay icin bir log kaydi secin.</div>
          ) : (
            <>
              <div className="log-dictionary-card">
                <AlertTriangle size={18} />
                <div>
                  <strong>{selectedDictionary.title}</strong>
                  <span>{selectedDictionary.message}</span>
                  <small>{selectedDictionary.action}</small>
                </div>
              </div>
              <div className="log-detail-grid">
                <div><span>Servis</span><strong>{serviceLabel(serviceType(selectedLog))}</strong></div>
                <div><span>Method</span><strong>{selectedLog.method || '-'}</strong></div>
                <div><span>Sure</span><strong>{selectedLog.duration_ms || 0} ms</strong></div>
                <div><span>Tarih</span><strong>{formatDate(selectedLog.created_at)}</strong></div>
              </div>
              <div className="soft-empty"><strong>Endpoint</strong><span>{selectedLog.endpoint || '-'}</span></div>
              {selectedLog.error_message && <div className="soft-empty workflow-warning"><strong>Ham hata mesaji</strong><span>{selectedLog.error_message}</span></div>}
              <div className="log-payload-summary">
                <div><span>Request ozeti</span><strong>{jsonSummary(selectedLog.request_payload)}</strong></div>
                <div><span>Response ozeti</span><strong>{jsonSummary(selectedLog.response_payload)}</strong></div>
              </div>
              <details className="json-collapse">
                <summary>Maskelenmis request JSON</summary>
                <pre>{JSON.stringify(maskValue(selectedLog.request_payload || {}), null, 2)}</pre>
              </details>
              <details className="json-collapse">
                <summary>Maskelenmis response JSON</summary>
                <pre>{JSON.stringify(maskValue(selectedLog.response_payload || {}), null, 2)}</pre>
              </details>
              <Link className="button-link" to={fixLink(selectedLog)}>Ilgili Ekrana Git</Link>
            </>
          )}
        </aside>
      </section>
    </>
  );
}
