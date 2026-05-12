import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, ClipboardList, ExternalLink, FileText, Link2, PackageCheck, RefreshCw, Send, ShoppingBag, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { CredentialInput } from '../../components/CredentialInput.jsx';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  ['connection', 'Genel Durum', Link2],
  ['account', 'Magaza Bilgileri', ShoppingBag],
  ['catalog', 'Kategori Onizleme', Tags],
  ['queue', 'Urun Aktarimi', Send],
  ['price', 'Stok Fiyat', Boxes],
  ['orders', 'Siparisler', ClipboardList],
  ['unsupported', 'Planlanan Alanlar', FileText],
  ['logs', 'Hata Kayitlari', PackageCheck],
];

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function userMessage(error) {
  const value = String(error || '');
  if (value.includes('401')) return 'Hepsiburada baglanti bilgileri hatali olabilir. Merchant ID, kullanici adi ve parola alanlarini kontrol edin.';
  if (value.includes('403')) return 'Hepsiburada hesabi bu islem icin yetkili gorunmuyor.';
  if (value.includes('429')) return 'Hepsiburada istek limiti doldu. Biraz bekleyip tekrar deneyin.';
  return error || 'Hepsiburada islemi tamamlanamadi.';
}

function resultSummary(result) {
  if (!result) return null;
  if (result.message) return result.message;
  if (Array.isArray(result.categories)) return `${result.categories.length} kategori alindi.`;
  if (result.queued) return 'Islem kuyruga alindi.';
  return 'Islem tamamlandi.';
}

export function HepsiburadaPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('connection');
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState({ company_id: '', name: '', merchant_id: '', api_key: '', api_secret: '', service_username: '', service_password: '', environment: 'production' });
  const [categories, setCategories] = useState([]);
  const [result, setResult] = useState(null);

  const selectedAccount = useMemo(() => accounts.find((account) => String(account.id) === String(accountId)), [accounts, accountId]);
  const hasError = selectedAccount?.connection_status === 'failed' || Boolean(selectedAccount?.last_error);

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse, logResponse] = await Promise.all([api.marketplaces.list(), api.companies.list(), api.logs.list()]);
      const hepsiburadaAccounts = (accountResponse.data || []).filter((account) => account.code === 'hepsiburada');
      setAccounts(hepsiburadaAccounts);
      setCompanies(companyResponse.data || []);
      setLogs((logResponse.data || []).filter((log) => log.marketplace_code === 'hepsiburada').slice(0, 20));
      setAccountId((current) => current || hepsiburadaAccounts[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedAccount) return;
    setForm({
      company_id: selectedAccount.company_id || '',
      name: selectedAccount.name || '',
      merchant_id: selectedAccount.merchant_id || '',
      api_key: '',
      api_secret: '',
      service_username: '',
      service_password: '',
      environment: selectedAccount.metadata?.environment || 'production',
    });
  }, [selectedAccount?.id]);

  const execute = async (label, callback) => {
    await run(async () => {
      const response = await callback();
      setResult(response);
      if (response.categories) setCategories(response.categories);
      notify('success', resultSummary(response) || `${label} tamamlandi.`);
      await load();
    }, { onError: (message) => notify('error', userMessage(message)) });
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    const payload = {
      company_id: form.company_id,
      code: 'hepsiburada',
      name: form.name,
      merchant_id: form.merchant_id,
      api_key: form.api_key || form.service_username || undefined,
      api_secret: form.api_secret || form.service_password || undefined,
      service_username: form.service_username || form.api_key || undefined,
      service_password: form.service_password || form.api_secret || undefined,
      is_active: true,
      metadata: {
        ...(selectedAccount?.metadata || {}),
        environment: form.environment,
      },
    };
    await execute('Hepsiburada hesabi', () => selectedAccount ? api.marketplaces.update(selectedAccount.id, payload) : api.marketplaces.create(payload));
  };

  const accountRequired = () => {
    if (!accountId) notify('error', 'Once Hepsiburada hesabi seciniz.');
    return !!accountId;
  };

  const renderActionResult = () => result ? (
    <section className="panel">
      <h2>Son Islem Sonucu</h2>
      <div className="soft-empty success-empty">{resultSummary(result)}</div>
      <pre className="json-preview">{JSON.stringify(result, null, 2)}</pre>
    </section>
  ) : null;

  return (
    <>
      <PageHeader
        title="Hepsiburada Yonetim Merkezi"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/marketplaces/onboarding">Kurulum Sihirbazi</Link>
            <Link className="button-link secondary-link" to="/resources">Developer Center <ExternalLink size={14} /></Link>
          </>
        )}
      />

      <section className="queue-summary">
        <div className="stat-card"><span>Baglanti</span><strong>{selectedAccount?.connection_status || 'unknown'}</strong><small>{formatDate(selectedAccount?.connection_checked_at)}</small></div>
        <div className="stat-card"><span>Merchant ID</span><strong>{selectedAccount?.merchant_id || '-'}</strong><small>{selectedAccount?.company?.name || 'Firma yok'}</small></div>
        <div className="stat-card"><span>Son urun</span><strong>{formatDate(selectedAccount?.last_product_sync_at)}</strong><small>Urun gonderimi</small></div>
        <div className="stat-card"><span>Son stok/fiyat</span><strong>{formatDate(selectedAccount?.last_price_sync_at)}</strong><small>Fiyat envanter</small></div>
        <div className="stat-card"><span>Hata</span><strong>{hasError ? 'Var' : 'Yok'}</strong><small>{selectedAccount?.last_error || 'Son siparis ' + formatDate(selectedAccount?.last_order_sync_at)}</small></div>
      </section>

      <div className="tabs">
        {tabs.map(([key, label, Icon]) => <button type="button" className={activeTab === key ? 'tab active' : 'tab'} key={key} onClick={() => setActiveTab(key)}><Icon size={15} /> {label}</button>)}
      </div>

      <section className="panel compact-panel">
        <h2>Hesap Secimi</h2>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Hepsiburada hesabi seciniz</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.company?.name}</option>)}
        </select>
      </section>

      {error && <ErrorState message={userMessage(error)} onRetry={load} />}
      {loading && accounts.length === 0 ? <LoadingState /> : null}

      {activeTab === 'connection' && (
        <section className="panel compact-panel">
          <h2>Entegrasyon Durum Ozeti</h2>
          <div className="detail-grid">
            <div className="detail-card"><span>Baglanti Durumu</span><strong>{selectedAccount?.connection_status || 'Kontrol edilmedi'}</strong></div>
            <div className="detail-card"><span>Son Kontrol</span><strong>{formatDate(selectedAccount?.connection_checked_at)}</strong></div>
            <div className="detail-card"><span>API Anahtari</span><strong>{selectedAccount?.api_key ? 'Maskeli kayitli' : 'Eksik'}</strong></div>
            <div className="detail-card"><span>Son Hata</span><strong>{selectedAccount?.last_error || 'Yok'}</strong></div>
          </div>
          <div className="wizard-actions inline-actions">
            <button type="button" disabled={!accountId || loading} onClick={() => accountRequired() && execute('Baglanti testi', () => api.marketplaces.hepsiburadaTest(accountId))}><RefreshCw size={16} /> Baglanti Testi Yap</button>
            <Link className="button-link secondary-link" to="/marketplaces/onboarding">Kuruluma Don</Link>
          </div>
        </section>
      )}

      {activeTab === 'account' && (
        <section className="panel">
          <h2>Magaza / Merchant Bilgileri</h2>
          <form className="form-grid" onSubmit={saveAccount}>
            <Field label="Firma">
              <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
                <option value="">Seciniz</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Merchant ID"><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
            <Field label="Kullanici Adi / API Key"><input value={form.api_key || form.service_username} onChange={(event) => setForm({ ...form, api_key: event.target.value, service_username: event.target.value })} placeholder="Kayitli ise bos birakabilirsiniz" /></Field>
            <Field label="Parola / API Secret"><CredentialInput value={form.api_secret || form.service_password} onChange={(event) => setForm({ ...form, api_secret: event.target.value, service_password: event.target.value })} placeholder="Kayitli ise bos birakabilirsiniz" /></Field>
            <Field label="Ortam">
              <select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}>
                <option value="production">Canli Ortam</option>
                <option value="stage">Test Ortami</option>
              </select>
            </Field>
            <button disabled={loading}>Kaydet</button>
            <button type="button" disabled={loading || !accountId} onClick={() => accountRequired() && execute('Baglanti testi', () => api.marketplaces.hepsiburadaTest(accountId))}><RefreshCw size={16} /> Kaydetmeden Test Et</button>
          </form>
        </section>
      )}

      {activeTab === 'catalog' && (
        <section className="panel">
          <h2>Kategori Onizleme</h2>
          <p className="muted-text">Hepsiburada kategori servisi mevcut endpoint uzerinden cagrilir. Gelen kategoriler onizleme olarak listelenir, eslestirme icin kategori eslestirme ekranini kullanin.</p>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Kategori listesi', () => api.marketplaces.hepsiburadaCategories(accountId))}><RefreshCw size={16} /> Kategorileri Cek</button>
            <Link className="button-link secondary-link" to="/products/category-mapping">Kategori Eslestirme</Link>
          </div>
          {categories.length > 0 ? (
            <div className="category-list marketplace-preview-list">
              {categories.slice(0, 18).map((category) => (
                <span key={category.id || category.categoryId || category.name}>{category.name || category.categoryName || category.title}</span>
              ))}
            </div>
          ) : <div className="soft-empty">Kategori cekildiginde ilk kayitlar burada gorunur.</div>}
        </section>
      )}

      {activeTab === 'queue' && (
        <section className="panel">
          <h2>Urun Gonderme</h2>
          <p className="muted-text">Hazir urunleri aktarim listesinden kontrol edip Hepsiburada gonderim kuyruguna alabilirsiniz.</p>
          <div className="bulk-grid">
            <Link className="button-link secondary-link" to="/products/publish-queue">Aktarim Listesini Ac</Link>
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Hepsiburada urun gonderimi', () => api.marketplaces.hepsiburadaSendProducts(accountId))}><Send size={16} /> Urunleri Gonder</button>
          </div>
        </section>
      )}

      {activeTab === 'price' && (
        <section className="panel">
          <h2>Stok / Fiyat Guncelleme</h2>
          <p className="muted-text">Hepsiburada stok ve fiyat guncellemesi mevcut kuyruk altyapisi uzerinden baslatilir.</p>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Stok fiyat guncelleme', () => api.marketplaces.hepsiburadaUpdatePriceInventory(accountId))}><RefreshCw size={16} /> Toplu Stok/Fiyat Gonder</button>
          </div>
        </section>
      )}

      {activeTab === 'orders' && (
        <section className="panel">
          <h2>Siparisleri Cek</h2>
          <p className="muted-text">Hepsiburada siparisleri kuyruga alinir ve sonuc Hata Merkezi ile siparis ekranlarindan takip edilir.</p>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Siparisleri cekme', () => api.marketplaces.hepsiburadaPullOrders(accountId))}>Siparisleri Cek</button>
            <Link className="button-link secondary-link" to="/orders">Siparisleri Ac</Link>
          </div>
        </section>
      )}

      {activeTab === 'unsupported' && (
        <section className="panel">
          <h2>Planlanan / Endpoint Bekleyen Alanlar</h2>
          <div className="unsupported-grid">
            <div className="soft-empty"><AlertTriangle size={16} /> Batch sonuc sorgulama icin Hepsiburada endpointi mevcut degil.</div>
            <div className="soft-empty"><AlertTriangle size={16} /> Iade, soru-cevap ve fatura linki aksiyonlari Hepsiburada tarafinda henuz bagli degil.</div>
            <div className="soft-empty"><AlertTriangle size={16} /> Detayli urun durum filtreleri icin backend endpointi eklendiginde bu ekran genisletilebilir.</div>
          </div>
        </section>
      )}

      {activeTab === 'logs' && (
        <DataTable
          rows={logs}
          emptyTitle="Hepsiburada hata kaydi yok"
          emptyText="Bir Hepsiburada isleminde hata veya uyari olusursa burada gorunur."
          columns={[
            { key: 'method', label: 'Islem Turu' },
            { key: 'endpoint', label: 'Islem Adresi' },
            { key: 'status_code', label: 'Kod' },
            { key: 'duration_ms', label: 'Sure' },
            { key: 'error_message', label: 'Hata', render: (row) => row.error_message || '-' },
          ]}
        />
      )}

      {renderActionResult()}
    </>
  );
}
