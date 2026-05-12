import { useEffect, useMemo, useState } from 'react';
import { Activity, Boxes, ClipboardList, FileText, HelpCircle, Layers3, Link2, PackageCheck, RefreshCw, RotateCcw, Send, Tags } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  ['connection', 'Baglanti', Link2],
  ['catalog', 'Kategori Marka', Layers3],
  ['mapping', 'Ozellik Esleme', Tags],
  ['queue', 'Urun Kuyrugu', Send],
  ['batch', 'Batch Sonuclari', Activity],
  ['price', 'Stok Fiyat', Boxes],
  ['orders', 'Siparis Webhook', ClipboardList],
  ['returns', 'Iade', RotateCcw],
  ['questions', 'Soru Cevap', HelpCircle],
  ['invoice', 'Fatura', FileText],
  ['logs', 'API Loglari', PackageCheck],
];

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function userMessage(error) {
  if (String(error || '').includes('401')) return 'Trendyol API bilgileri hatali veya ortam bilgileri uyumsuz.';
  if (String(error || '').includes('429')) return 'Trendyol rate limit doldu. Biraz bekleyip tekrar deneyin.';
  return error;
}

export function TrendyolPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('connection');
  const [accountId, setAccountId] = useState('');
  const [form, setForm] = useState({ company_id: '', name: '', supplier_id: '', api_key: '', api_secret: '', environment: 'production', user_agent: '' });
  const [categoryId, setCategoryId] = useState('');
  const [attributeId, setAttributeId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [barcodes, setBarcodes] = useState('');
  const [packageId, setPackageId] = useState('');
  const [invoiceLink, setInvoiceLink] = useState('');
  const [result, setResult] = useState(null);

  const selectedAccount = useMemo(() => accounts.find((account) => String(account.id) === String(accountId)), [accounts, accountId]);

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse, logResponse] = await Promise.all([api.marketplaces.list(), api.companies.list(), api.logs.list()]);
      const trendyolAccounts = (accountResponse.data || []).filter((account) => account.code === 'trendyol');
      setAccounts(trendyolAccounts);
      setCompanies(companyResponse.data || []);
      setLogs((logResponse.data || []).filter((log) => log.marketplace_code === 'trendyol').slice(0, 20));
      setAccountId((current) => current || trendyolAccounts[0]?.id || '');
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
      supplier_id: selectedAccount.supplier_id || '',
      api_key: '',
      api_secret: '',
      environment: selectedAccount.metadata?.environment || 'production',
      user_agent: selectedAccount.metadata?.user_agent || `${selectedAccount.supplier_id} - BalinaEntegrasyon`,
    });
  }, [selectedAccount?.id]);

  const execute = async (label, callback) => {
    await run(async () => {
      const response = await callback();
      setResult(response);
      notify('success', response.message || `${label} tamamlandi.`);
      await load();
    }, { onError: (message) => notify('error', userMessage(message)) });
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    const payload = {
      company_id: form.company_id,
      code: 'trendyol',
      name: form.name,
      supplier_id: form.supplier_id,
      api_key: form.api_key || undefined,
      api_secret: form.api_secret || undefined,
      is_active: true,
      metadata: {
        ...(selectedAccount?.metadata || {}),
        environment: form.environment,
        user_agent: form.user_agent || `${form.supplier_id} - BalinaEntegrasyon`,
      },
    };
    await execute('Trendyol hesabi', () => selectedAccount ? api.marketplaces.update(selectedAccount.id, payload) : api.marketplaces.create(payload));
  };

  const accountRequired = () => {
    if (!accountId) notify('error', 'Once Trendyol hesabi seciniz.');
    return !!accountId;
  };

  const renderActionResult = () => result ? (
    <section className="panel">
      <h2>Sonuc</h2>
      <pre className="json-preview">{JSON.stringify(result, null, 2)}</pre>
    </section>
  ) : null;

  return (
    <>
      <PageHeader title="Trendyol Yonetim Merkezi" />
      <section className="queue-summary">
        <div className="stat-card"><span>Baglanti</span><strong>{selectedAccount?.connection_status || 'unknown'}</strong><small>{formatDate(selectedAccount?.connection_checked_at)}</small></div>
        <div className="stat-card"><span>Ortam</span><strong>{selectedAccount?.metadata?.environment || 'production'}</strong><small>{selectedAccount?.supplier_id || '-'}</small></div>
        <div className="stat-card"><span>Urun Sync</span><strong>{formatDate(selectedAccount?.last_product_sync_at)}</strong><small>{selectedAccount?.metadata?.last_product_batch_request_id || '-'}</small></div>
        <div className="stat-card"><span>Stok Fiyat</span><strong>{formatDate(selectedAccount?.last_price_sync_at)}</strong><small>{selectedAccount?.metadata?.last_price_batch_request_id || '-'}</small></div>
        <div className="stat-card"><span>Son Hata</span><strong>{selectedAccount?.last_error ? 'Var' : 'Yok'}</strong><small>{selectedAccount?.last_error || '-'}</small></div>
      </section>

      <div className="tabs">
        {tabs.map(([key, label, Icon]) => <button type="button" className={activeTab === key ? 'tab active' : 'tab'} key={key} onClick={() => setActiveTab(key)}><Icon size={15} /> {label}</button>)}
      </div>

      <section className="panel compact-panel">
        <h2>Hesap Secimi</h2>
        <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
          <option value="">Trendyol hesabi seciniz</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.company?.name}</option>)}
        </select>
      </section>

      {error && <ErrorState message={userMessage(error)} onRetry={load} />}
      {loading && accounts.length === 0 ? <LoadingState /> : null}

      {activeTab === 'connection' && (
        <section className="panel">
          <h2>Baglanti Bilgileri</h2>
          <form className="form-grid" onSubmit={saveAccount}>
            <Field label="Firma">
              <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
                <option value="">Seciniz</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Supplier ID"><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value, user_agent: `${event.target.value} - BalinaEntegrasyon` })} /></Field>
            <Field label="API Key"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} placeholder="Kayitli ise bos birakabilirsiniz" /></Field>
            <Field label="API Secret"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} placeholder="Kayitli ise bos birakabilirsiniz" /></Field>
            <Field label="Ortam">
              <select value={form.environment} onChange={(event) => setForm({ ...form, environment: event.target.value })}>
                <option value="production">Canli - apigw.trendyol.com</option>
                <option value="stage">Test - stageapigw.trendyol.com</option>
              </select>
            </Field>
            <Field label="User-Agent"><input value={form.user_agent} onChange={(event) => setForm({ ...form, user_agent: event.target.value })} /></Field>
            <button disabled={loading}>Kaydet</button>
            <button type="button" disabled={loading || !accountId} onClick={() => accountRequired() && execute('Baglanti testi', () => api.marketplaces.trendyolTest(accountId))}><RefreshCw size={16} /> Baglanti Testi</button>
          </form>
        </section>
      )}

      {activeTab === 'catalog' && (
        <section className="panel">
          <h2>Kategori ve Marka Senkronizasyonu</h2>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Kategori agaci', () => api.marketplaces.trendyolCategories(accountId))}><RefreshCw size={16} /> Kategori Agaci</button>
            <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Marka listesi', () => api.marketplaces.trendyolBrands(accountId))}><RefreshCw size={16} /> Marka Listesi</button>
            <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Kategori ID" />
            <button disabled={!accountId || !categoryId || loading} onClick={() => execute('Kategori ozellikleri', () => api.marketplaces.trendyolCategoryAttributes(accountId, categoryId))}>Ozellikleri Getir</button>
            <input value={attributeId} onChange={(event) => setAttributeId(event.target.value)} placeholder="Ozellik ID" />
            <button disabled={!accountId || !categoryId || !attributeId || loading} onClick={() => execute('Ozellik degerleri', () => api.marketplaces.trendyolCategoryAttributeValues(accountId, categoryId, attributeId))}>Degerleri Getir</button>
          </div>
        </section>
      )}

      {activeTab === 'mapping' && (
        <section className="panel">
          <h2>Kategori - Ozellik Esleştirme</h2>
          <p className="muted-text">Urun gonderme wizard'i Trendyol kategori ID degerine gore bu servislerden zorunlu ozellikleri alir. Eksik zorunlu ozellik varsa gonderim engellenir.</p>
          <div className="bulk-grid"><input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Kategori ID" /><button disabled={!accountId || !categoryId} onClick={() => execute('Zorunlu ozellik kontrolu', () => api.marketplaces.trendyolCategoryAttributes(accountId, categoryId))}>Zorunlu Ozellikleri Kontrol Et</button></div>
        </section>
      )}

      {activeTab === 'queue' && (
        <section className="panel">
          <h2>Urun Aktarim Kuyrugu</h2>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => execute('Toplu urun gonderimi', () => api.marketplaces.trendyolSendProducts(accountId))}><Send size={16} /> Toplu Urun Gonder</button>
            <button disabled={!accountId || loading} onClick={() => execute('Onayli urunler', () => api.marketplaces.trendyolFilterProducts(accountId, { state: 'approved' }))}>Onayli Urunler</button>
            <button disabled={!accountId || loading} onClick={() => execute('Onaysiz urunler', () => api.marketplaces.trendyolFilterProducts(accountId, { state: 'unapproved' }))}>Onaysiz Urunler</button>
          </div>
        </section>
      )}

      {activeTab === 'batch' && (
        <section className="panel">
          <h2>Batch Sonuclari</h2>
          <div className="bulk-grid"><input value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="Batch Request ID" /><button disabled={!accountId || !batchId || loading} onClick={() => execute('Batch sonucu', () => api.marketplaces.trendyolBatchResult(accountId, batchId))}>Sorgula</button></div>
        </section>
      )}

      {activeTab === 'price' && (
        <section className="panel">
          <h2>Stok / Fiyat Guncelleme</h2>
          <div className="bulk-grid"><button disabled={!accountId || loading} onClick={() => execute('Stok fiyat guncelleme', () => api.marketplaces.trendyolUpdatePriceInventory(accountId))}>Toplu Stok/Fiyat Gonder</button></div>
        </section>
      )}

      {activeTab === 'orders' && (
        <section className="panel">
          <h2>Siparis ve Webhook</h2>
          <div className="bulk-grid">
            <button disabled={!accountId || loading} onClick={() => execute('Siparis stream', () => api.marketplaces.trendyolOrdersStream(accountId))}>getShipmentPackagesStream</button>
            <button disabled={!accountId || loading} onClick={() => execute('Klasik siparis cekme', () => api.marketplaces.trendyolPullOrders(accountId))}>Klasik Siparis Cek</button>
          </div>
        </section>
      )}

      {activeTab === 'returns' && (
        <section className="panel">
          <h2>Iade Yonetimi</h2>
          <button disabled={!accountId || loading} onClick={() => execute('Iade talepleri', () => api.marketplaces.trendyolReturns(accountId))}>Iade Taleplerini Cek</button>
        </section>
      )}

      {activeTab === 'questions' && (
        <section className="panel">
          <h2>Musteri Soru - Cevap</h2>
          <button disabled={!accountId || loading} onClick={() => execute('Soru listesi', () => api.marketplaces.trendyolQuestions(accountId))}>Sorulari Cek</button>
        </section>
      )}

      {activeTab === 'invoice' && (
        <section className="panel">
          <h2>Fatura Gonderimi</h2>
          <div className="bulk-grid">
            <input value={packageId} onChange={(event) => setPackageId(event.target.value)} placeholder="Paket ID" />
            <input value={invoiceLink} onChange={(event) => setInvoiceLink(event.target.value)} placeholder="Fatura PDF linki" />
            <button disabled={!accountId || !packageId || !invoiceLink || loading} onClick={() => execute('Fatura linki', () => api.marketplaces.trendyolSendInvoiceLink(accountId, packageId, { invoice_link: invoiceLink }))}>Fatura Linki Gonder</button>
            <button disabled={!accountId || loading} onClick={() => execute('Ortak etiket barkod', () => api.marketplaces.trendyolCommonLabelBarcodes(accountId))}>Ortak Etiket Barkod</button>
          </div>
        </section>
      )}

      {activeTab === 'logs' && (
        <DataTable
          rows={logs}
          emptyTitle="Trendyol API logu yok"
          emptyText="Bir Trendyol islemi calistiginda loglar burada gorunur."
          columns={[
            { key: 'method', label: 'Method' },
            { key: 'endpoint', label: 'Endpoint' },
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
