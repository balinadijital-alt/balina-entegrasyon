import { useEffect, useMemo, useState } from 'react';
import { Activity, Boxes, ClipboardList, FileText, HelpCircle, Layers3, Link2, PackageCheck, RefreshCw, RotateCcw, Send, Tags } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, asArray } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  ['connection', 'Genel Durum', Link2],
  ['account', 'Hesap Bilgileri', Link2],
  ['catalog', 'Kategori Marka Guncelle', Layers3],
  ['mapping', 'Kategori Esleme', Tags],
  ['queue', 'Urun Aktarim', Send],
  ['batch', 'Aktarim Sonuclari', Activity],
  ['price', 'Stok Fiyat', Boxes],
  ['orders', 'Siparisler', ClipboardList],
  ['returns', 'Iadeler', RotateCcw],
  ['questions', 'Sorular', HelpCircle],
  ['invoice', 'Faturalar', FileText],
  ['logs', 'Hata Kayitlari', PackageCheck],
];

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function userMessage(error) {
  if (String(error || '').includes('401')) return 'Trendyol baglanti bilgileri hatali veya ortam bilgileri uyumsuz.';
  if (String(error || '').includes('429')) return 'Trendyol istek limiti doldu. Biraz bekleyip tekrar deneyin.';
  return error;
}

export function TrendyolPage() {
  const { notify, user } = useApp();
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
  const canManageMarketplaces = hasPermission(user, 'marketplaces.manage');
  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse, logResponse] = await Promise.all([api.marketplaces.list(), api.companies.list(), api.logs.list()]);
      const trendyolAccounts = asArray(accountResponse).filter((account) => account.code === 'trendyol');
      setAccounts(trendyolAccounts);
      setCompanies(asArray(companyResponse));
      setLogs(asArray(logResponse).filter((log) => log.marketplace_code === 'trendyol').slice(0, 20));
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
    if (!canManageMarketplaces) return;
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
      <PageHeader
        title="Trendyol Yonetim Merkezi"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/marketplace-mapping">Pazaryeri Eslestirmeleri</Link>
            {canSendMarketplaces && <Link className="button-link" to="/products/publish-wizard">Toplu Pazaryeri Islemleri</Link>}
          </>
        )}
      />
      <section className="queue-summary">
        <div className="stat-card"><span>Baglanti</span><strong>{selectedAccount?.connection_status || 'unknown'}</strong><small>{formatDate(selectedAccount?.connection_checked_at)}</small></div>
        <div className="stat-card"><span>Hazir Urun</span><strong>{selectedAccount?.metadata?.ready_product_count || 0}</strong><small>Aktarima uygun</small></div>
        <div className="stat-card"><span>Eksik Urun</span><strong>{selectedAccount?.metadata?.blocked_product_count || 0}</strong><small>Kategori/ozellik bekliyor</small></div>
        <div className="stat-card"><span>Bekleyen Aktarim</span><strong>{selectedAccount?.metadata?.pending_batch_count || 0}</strong><small>{selectedAccount?.metadata?.last_product_batch_request_id || '-'}</small></div>
        <div className="stat-card"><span>Hatali Urun</span><strong>{selectedAccount?.last_error ? 'Var' : 'Yok'}</strong><small>{selectedAccount?.last_error || 'Son siparis sync ' + formatDate(selectedAccount?.last_order_sync_at)}</small></div>
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
        <section className="panel compact-panel">
          <h2>Operasyon Ozeti</h2>
          <div className="detail-grid">
            <DetailItem className="detail-card" label="Baglanti" value={selectedAccount?.connection_status || 'unknown'} />
            <DetailItem className="detail-card" label="Son urun guncelleme" value={formatDate(selectedAccount?.last_product_sync_at)} />
            <DetailItem className="detail-card" label="Son stok/fiyat guncelleme" value={formatDate(selectedAccount?.last_price_sync_at)} />
            <DetailItem className="detail-card" label="Son hata" value={selectedAccount?.last_error ? 'Var' : 'Yok'} />
          </div>
        </section>
      )}

      {activeTab === 'account' && (
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
            {canManageMarketplaces && <button disabled={loading}>Kaydet</button>}
            {canManageMarketplaces && <button type="button" disabled={loading || !accountId} onClick={() => accountRequired() && execute('Baglanti testi', () => api.marketplaces.trendyolTest(accountId))}><RefreshCw size={16} /> Baglanti Testi</button>}
          </form>
        </section>
      )}

      {activeTab === 'catalog' && (
        <section className="panel">
          <h2>Kategori ve Marka Guncelleme</h2>
          <div className="bulk-grid">
            {canManageMarketplaces && <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Kategori agaci', () => api.marketplaces.trendyolCategories(accountId))}><RefreshCw size={16} /> Kategori Agaci</button>}
            {canManageMarketplaces && <button disabled={!accountId || loading} onClick={() => accountRequired() && execute('Marka listesi', () => api.marketplaces.trendyolBrands(accountId))}><RefreshCw size={16} /> Marka Listesi</button>}
            <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Kategori ID" />
            {canManageMarketplaces && <button disabled={!accountId || !categoryId || loading} onClick={() => execute('Kategori ozellikleri', () => api.marketplaces.trendyolCategoryAttributes(accountId, categoryId))}>Ozellikleri Getir</button>}
            <input value={attributeId} onChange={(event) => setAttributeId(event.target.value)} placeholder="Ozellik ID" />
            {canManageMarketplaces && <button disabled={!accountId || !categoryId || !attributeId || loading} onClick={() => execute('Ozellik degerleri', () => api.marketplaces.trendyolCategoryAttributeValues(accountId, categoryId, attributeId))}>Degerleri Getir</button>}
          </div>
        </section>
      )}

      {activeTab === 'mapping' && (
        <section className="panel">
          <h2>Kategori - Ozellik Esleştirme</h2>
          <p className="muted-text">Urun gonderme sihirbazi Trendyol kategori bilgisine gore zorunlu ozellikleri kontrol eder. Eksik zorunlu ozellik varsa gonderim engellenir.</p>
          <div className="bulk-grid">
            <input value={categoryId} onChange={(event) => setCategoryId(event.target.value)} placeholder="Kategori ID" />
            {canManageMarketplaces && <button disabled={!accountId || !categoryId} onClick={() => execute('Zorunlu ozellik kontrolu', () => api.marketplaces.trendyolCategoryAttributes(accountId, categoryId))}>Zorunlu Ozellikleri Kontrol Et</button>}
            <Link className="button-link" to="/marketplace-mapping/categories">Kategori Esleme Sayfasina Git</Link>
          </div>
        </section>
      )}

      {activeTab === 'queue' && (
        <section className="panel">
          <h2>Urun Aktarim Listesi</h2>
          <div className="bulk-grid">
            <Link className="button-link secondary-link" to="/products/publish-queue">Gonderim Kuyrugunu Ac</Link>
            <Link className="button-link secondary-link" to="/products/publish-wizard">Urun Gonderme Sihirbazi</Link>
            {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Toplu urun gonderimi', () => api.marketplaces.trendyolSendProducts(accountId))}><Send size={16} /> Toplu Urun Gonder</button>}
            {canManageMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Onayli urunler', () => api.marketplaces.trendyolFilterProducts(accountId, { state: 'approved' }))}>Onayli Urunler</button>}
            {canManageMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Onaysiz urunler', () => api.marketplaces.trendyolFilterProducts(accountId, { state: 'unapproved' }))}>Onaysiz Urunler</button>}
          </div>
        </section>
      )}

      {activeTab === 'batch' && (
        <section className="panel">
          <h2>Aktarim Sonuclari</h2>
          <div className="bulk-grid"><input value={batchId} onChange={(event) => setBatchId(event.target.value)} placeholder="Pazaryeri takip numarasi" /><button disabled={!accountId || !batchId || loading} onClick={() => execute('Aktarim sonucu', () => api.marketplaces.trendyolBatchResult(accountId, batchId))}>Sorgula</button></div>
        </section>
      )}

      {activeTab === 'price' && (
        <section className="panel">
          <h2>Stok / Fiyat Guncelleme</h2>
          <div className="bulk-grid">{canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Stok fiyat guncelleme', () => api.marketplaces.trendyolUpdatePriceInventory(accountId))}>Toplu Stok/Fiyat Gonder</button>}</div>
        </section>
      )}

      {activeTab === 'orders' && (
        <section className="panel">
          <h2>Siparisleri Al</h2>
          <div className="bulk-grid">
            {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Yeni siparisleri alma', () => api.marketplaces.trendyolOrdersStream(accountId))}>Yeni Siparisleri Al</button>}
            {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Tum siparisleri alma', () => api.marketplaces.trendyolPullOrders(accountId))}>Tum Siparisleri Kontrol Et</button>}
          </div>
        </section>
      )}

      {activeTab === 'returns' && (
        <section className="panel">
          <h2>Iade Yonetimi</h2>
          {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Iade talepleri', () => api.marketplaces.trendyolReturns(accountId))}>Iade Taleplerini Cek</button>}
        </section>
      )}

      {activeTab === 'questions' && (
        <section className="panel">
          <h2>Musteri Soru - Cevap</h2>
          {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Soru listesi', () => api.marketplaces.trendyolQuestions(accountId))}>Sorulari Cek</button>}
        </section>
      )}

      {activeTab === 'invoice' && (
        <section className="panel">
          <h2>Fatura Gonderimi</h2>
          <div className="bulk-grid">
            <input value={packageId} onChange={(event) => setPackageId(event.target.value)} placeholder="Paket ID" />
            <input value={invoiceLink} onChange={(event) => setInvoiceLink(event.target.value)} placeholder="Fatura PDF linki" />
            {canSendMarketplaces && <button disabled={!accountId || !packageId || !invoiceLink || loading} onClick={() => execute('Fatura linki', () => api.marketplaces.trendyolSendInvoiceLink(accountId, packageId, { invoice_link: invoiceLink }))}>Fatura Linki Gonder</button>}
            {canSendMarketplaces && <button disabled={!accountId || loading} onClick={() => execute('Ortak etiket barkod', () => api.marketplaces.trendyolCommonLabelBarcodes(accountId))}>Ortak Etiket Barkod</button>}
          </div>
        </section>
      )}

      {activeTab === 'logs' && (
        <DataTable
          rows={logs}
          emptyTitle="Trendyol hata kaydi yok"
          emptyText="Bir Trendyol isleminde hata veya uyari olusursa burada gorunur."
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
