import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Filter,
  Landmark,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  Send,
  Undo2,
  WalletCards,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { api, asArray } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const currentInitial = {
  company_id: '',
  type: 'customer',
  name: '',
  email: '',
  tax_office: '',
  tax_number: '',
  identity_number: '',
  address: '',
  city: '',
  district: '',
};

const accountInitial = {
  company_id: '',
  accounting_integration_id: '',
  name: '',
  client_id: '',
  client_secret: '',
  username: '',
  password: '',
  api_key: '',
  api_secret: '',
  base_url: '',
};

const providerFilters = [
  { value: 'all', label: 'Tum ERP servisleri' },
  { value: 'parasut', label: 'Parasut' },
  { value: 'logo', label: 'Logo' },
  { value: 'mikro', label: 'Mikro' },
  { value: 'nebim', label: 'Nebim' },
  { value: 'qnb', label: 'QNB e-Finans' },
];

const statusFilters = [
  { value: 'all', label: 'Tum durumlar' },
  { value: 'draft', label: 'Kesilecek faturalar' },
  { value: 'queued', label: 'Kuyrukta' },
  { value: 'issued', label: 'Basarili e-faturalar' },
  { value: 'failed', label: 'Basarisiz faturalar' },
  { value: 'pdf_ready', label: 'PDF hazir' },
  { value: 'return', label: 'Iade faturasi' },
];

const invoiceTypeLabels = {
  einvoice: 'E-Fatura',
  earchive: 'E-Arsiv',
  return: 'Iade Faturasi',
};

const statusLabels = {
  draft: 'Taslak',
  queued: 'Kuyrukta',
  pending: 'Bekliyor',
  issued: 'Basarili',
  completed: 'Tamamlandi',
  failed: 'Basarisiz',
  cancelled: 'Iptal',
};

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('\u0131', 'i')
    .replaceAll('\u011f', 'g')
    .replaceAll('\u00fc', 'u')
    .replaceAll('\u015f', 's')
    .replaceAll('\u00f6', 'o')
    .replaceAll('\u00e7', 'c')
    .replace(/[^a-z0-9]+/g, ' ');
}

function providerText(invoice) {
  return invoice.account?.integration?.name || invoice.provider_name || invoice.provider_code || '-';
}

function providerCode(invoice) {
  return invoice.account?.integration?.code || invoice.provider_code || '';
}

function providerMatches(invoice, provider) {
  if (provider === 'all') {
    return true;
  }

  const haystack = normalize([providerCode(invoice), providerText(invoice)].join(' '));
  if (provider === 'qnb') {
    return haystack.includes('qnb') || haystack.includes('efinans') || haystack.includes('e finans');
  }

  return haystack.includes(provider);
}

function invoiceLogs(invoice, logs) {
  return logs.filter((log) => Number(log.invoice_id) === Number(invoice?.id));
}

function hasPdf(invoice) {
  return Boolean(invoice.pdf_path || invoice.pdf_url);
}

function hasInvoiceError(invoice, logs) {
  return invoice.status === 'failed' || Boolean(invoice.error_message) || invoiceLogs(invoice, logs).some((log) => log.error_message);
}

function statusMatches(invoice, status, logs) {
  if (status === 'all') {
    return true;
  }

  if (status === 'pdf_ready') {
    return hasPdf(invoice);
  }

  if (status === 'return') {
    return invoice.type === 'return' || Number(invoice.grand_total || 0) < 0;
  }

  if (status === 'failed') {
    return hasInvoiceError(invoice, logs);
  }

  return invoice.status === status;
}

function statusLabel(invoice) {
  return statusLabels[invoice.status] || invoice.status || 'Bilinmiyor';
}

function statusClass(invoice, logs) {
  if (hasInvoiceError(invoice, logs)) {
    return 'failed';
  }
  if (['issued', 'completed'].includes(invoice.status)) {
    return 'issued';
  }
  if (['queued', 'pending', 'draft'].includes(invoice.status)) {
    return 'queued';
  }
  return invoice.status || 'unknown';
}

function formatMoney(value, currency = 'TRY') {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: currency || 'TRY' }).format(amount);
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function currentAccountName(invoice) {
  return invoice.current_account?.name || invoice.currentAccount?.name || '-';
}

function errorSummary(invoice, logs) {
  return invoice.error_message || invoiceLogs(invoice, logs).find((log) => log.error_message)?.error_message || 'Hata detayi bulunmuyor.';
}

function latestLog(invoice, logs) {
  return invoiceLogs(invoice, logs)[0] || null;
}

export function AccountingPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [currentAccounts, setCurrentAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [logs, setLogs] = useState([]);
  const [currentForm, setCurrentForm] = useState(currentInitial);
  const [accountForm, setAccountForm] = useState(accountInitial);
  const [transactionForm, setTransactionForm] = useState({ current_account_id: '', type: 'collection', direction: 'credit', amount: '', description: '' });
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [filters, setFilters] = useState({
    provider: 'all',
    status: 'all',
    search: '',
  });

  const load = async () => {
    await run(async () => {
      const [companyResponse, integrationResponse, accountResponse, currentResponse, transactionResponse, invoiceResponse, logResponse] = await Promise.all([
        api.companies.list(),
        api.accounting.integrations(),
        api.accounting.accounts(),
        api.accounting.currentAccounts(),
        api.accounting.transactions(),
        api.accounting.invoices(),
        api.accounting.logs(),
      ]);
      const nextIntegrations = asArray(integrationResponse);
      const nextInvoices = asArray(invoiceResponse);

      setCompanies(asArray(companyResponse));
      setIntegrations(nextIntegrations);
      setAccounts(asArray(accountResponse));
      setCurrentAccounts(asArray(currentResponse));
      setTransactions(asArray(transactionResponse));
      setInvoices(nextInvoices);
      setLogs(asArray(logResponse));
      setSelectedInvoice((current) => {
        if (!nextInvoices.length) {
          return null;
        }

        return nextInvoices.find((invoice) => invoice.id === current?.id) || nextInvoices[0];
      });
      setAccountForm((current) => ({
        ...current,
        accounting_integration_id: current.accounting_integration_id || nextIntegrations[0]?.id || '',
      }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredInvoices = useMemo(() => {
    const query = normalize(filters.search);

    return invoices.filter((invoice) => {
      const searchText = normalize([
        invoice.id,
        invoice.invoice_number,
        invoice.external_id,
        invoice.order?.marketplace_order_id,
        currentAccountName(invoice),
        providerText(invoice),
        invoice.grand_total,
      ].join(' '));

      return providerMatches(invoice, filters.provider)
        && statusMatches(invoice, filters.status, logs)
        && (!query || searchText.includes(query));
    });
  }, [filters, invoices, logs]);

  const metrics = useMemo(() => {
    const debit = currentAccounts.filter((account) => Number(account.balance || 0) > 0).reduce((sum, account) => sum + Number(account.balance || 0), 0);
    const credit = currentAccounts.filter((account) => Number(account.balance || 0) < 0).reduce((sum, account) => sum + Math.abs(Number(account.balance || 0)), 0);

    return {
      draft: invoices.filter((invoice) => ['draft', 'queued', 'pending'].includes(invoice.status)).length,
      issued: invoices.filter((invoice) => ['issued', 'completed'].includes(invoice.status)).length,
      failed: invoices.filter((invoice) => hasInvoiceError(invoice, logs)).length,
      pdf: invoices.filter(hasPdf).length,
      returns: invoices.filter((invoice) => invoice.type === 'return' || Number(invoice.grand_total || 0) < 0).length,
      balance: debit - credit,
    };
  }, [currentAccounts, invoices, logs]);

  const successRate = invoices.length ? Math.round((metrics.issued / invoices.length) * 100) : 0;

  const saveCurrent = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.accounting.createCurrentAccount(currentForm);
      setCurrentForm(currentInitial);
      notify('success', 'Cari kart kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.accounting.createAccount({ ...accountForm, settings: { endpoints: {} } });
      setAccountForm(accountInitial);
      notify('success', 'Muhasebe entegrasyonu kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const addTransaction = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.accounting.addTransaction(transactionForm.current_account_id, { ...transactionForm, amount: Number(transactionForm.amount) });
      setTransactionForm({ current_account_id: '', type: 'collection', direction: 'credit', amount: '', description: '' });
      notify('success', 'Cari hareket kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const invoiceAction = async (id, fn, message) => {
    await run(async () => {
      const response = await fn(id);
      notify('success', response.message || message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const downloadPdf = async (id) => {
    await run(async () => {
      const blob = await api.accounting.downloadPdf(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fatura-${id}`;
      link.click();
      URL.revokeObjectURL(url);
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <div className="accounting-page">
      <PageHeader
        title="Muhasebe Operasyon Merkezi"
        description="Fatura, e-fatura, e-arsiv, cari hesap, tahsilat ve ERP entegrasyon sureclerini tek ekrandan yonetin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />

      <section className="accounting-hero">
        <div>
          <span className="eyebrow">Canli muhasebe akisi</span>
          <h2>Fatura, cari ve ERP entegrasyonlarini tek merkezden takip edin.</h2>
          <p>Kesilecek faturalar, ERP gonderim sonucu, PDF durumu, iade faturasi ve cari borc/alacak akisini ayni ekranda gorun.</p>
          <div className="accounting-hero-actions">
            <button type="button" onClick={() => setFilters({ provider: 'all', status: 'failed', search: '' })}>
              <AlertTriangle size={16} /> Kritik Hatalar
            </button>
            <RouterLink className="button-link secondary-link" to="/api-logs">API Loglari</RouterLink>
          </div>
        </div>
        <div className="accounting-hero-status">
          <Landmark size={28} />
          <strong>%{successRate}</strong>
          <span>Fatura basari orani</span>
          <small>{accounts.length} ERP hesabi, {formatMoney(metrics.balance)} cari bakiye ozeti.</small>
          <div className="progress"><span style={{ width: `${successRate}%` }} /></div>
        </div>
      </section>

      <section className="accounting-stat-grid">
        <MetricCard className="accounting-stat-card" icon={<ReceiptText size={18} />} label="Kesilecek faturalar" value={metrics.draft} tone="orange" />
        <MetricCard className="accounting-stat-card" icon={<CheckCircle2 size={18} />} label="Basarili e-faturalar" value={metrics.issued} tone="green" />
        <MetricCard className="accounting-stat-card" icon={<AlertTriangle size={18} />} label="Basarisiz faturalar" value={metrics.failed} tone="red" />
        <MetricCard className="accounting-stat-card" icon={<FileText size={18} />} label="PDF hazir olanlar" value={metrics.pdf} tone="blue" />
        <MetricCard className="accounting-stat-card" icon={<Undo2 size={18} />} label="Iade faturalari" value={metrics.returns} tone="purple" />
        <MetricCard className="accounting-stat-card" icon={<WalletCards size={18} />} label="Cari bakiye ozeti" value={formatMoney(metrics.balance)} tone="green" />
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && currentAccounts.length === 0 && invoices.length === 0 ? <LoadingState /> : (
        <>
          <section className="panel accounting-filter-panel">
            <div>
              <h2>Fatura kayitlari</h2>
              <p>ERP servisi, durum, siparis no, cari veya fatura numarasi ile filtreleyin.</p>
            </div>
            <div className="accounting-filter-row">
              <label>
                <Filter size={15} />
                <select value={filters.provider} onChange={(event) => setFilters({ ...filters, provider: event.target.value })}>
                  {providerFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <ReceiptText size={15} />
                <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  {statusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="accounting-search">
                <Search size={15} />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Siparis no, cari, fatura no veya ERP servisi ara"
                />
              </label>
            </div>
          </section>

          <section className="accounting-layout">
            <div className="panel accounting-table-panel">
              <div className="accounting-table-header">
                <div>
                  <h2>Fatura listesi</h2>
                  <p>{filteredInvoices.length} fatura kaydi goruntuleniyor.</p>
                </div>
                <StatusBadge tone={metrics.failed ? 'failed' : 'active'} label={metrics.failed ? 'Kontrol gerekli' : 'Saglikli'} />
              </div>
              <DataTable
                rows={filteredInvoices}
                emptyTitle="Fatura kaydi yok"
                emptyText="Siparislerden fatura olusturuldugunda e-fatura/e-arsiv kayitlari burada gorunur."
                columns={[
                  {
                    key: 'order',
                    label: 'Siparis No',
                    render: (row) => (
                      <button type="button" className="text-link" onClick={() => setSelectedInvoice(row)}>
                        {row.order?.marketplace_order_id || row.invoice_number || `#${row.id}`}
                      </button>
                    ),
                  },
                  { key: 'current', label: 'Musteri/Cari', render: currentAccountName },
                  { key: 'type', label: 'Fatura Tipi', render: (row) => invoiceTypeLabels[row.type] || row.type || '-' },
                  { key: 'grand_total', label: 'Tutar', render: (row) => formatMoney(row.grand_total, row.currency) },
                  { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={statusClass(row, logs)} label={statusLabel(row)} /> },
                  { key: 'provider', label: 'ERP Saglayici', render: providerText },
                  { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.issued_at || row.created_at) },
                  {
                    key: 'actions',
                    label: 'Islem',
                    render: (row) => (
                      <div className="row-actions accounting-row-actions">
                        <button type="button" title="Durum sorgula" onClick={() => invoiceAction(row.id, api.accounting.queryInvoice, 'Sorgu kuyruga alindi.')}>
                          <RotateCcw size={15} />
                        </button>
                        <button type="button" title="PDF olustur" onClick={() => invoiceAction(row.id, api.accounting.createPdf, 'PDF kuyruga alindi.')}>
                          <FileText size={15} />
                        </button>
                        <button type="button" title="PDF indir" onClick={() => downloadPdf(row.id)} disabled={!hasPdf(row)}>
                          <Download size={15} />
                        </button>
                        <button type="button" title="Iade faturasi olustur" onClick={() => invoiceAction(row.id, api.accounting.returnInvoice, 'Iade faturasi kuyruga alindi.')} disabled={row.type === 'return'}>
                          <Undo2 size={15} />
                        </button>
                        <button type="button" title="Detay gor" onClick={() => setSelectedInvoice(row)}>
                          <Eye size={15} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <InvoiceDetailPanel
              invoice={selectedInvoice}
              logs={logs}
              onQuery={(id) => invoiceAction(id, api.accounting.queryInvoice, 'Sorgu kuyruga alindi.')}
              onPdf={(id) => invoiceAction(id, api.accounting.createPdf, 'PDF kuyruga alindi.')}
              onDownload={downloadPdf}
              onReturn={(id) => invoiceAction(id, api.accounting.returnInvoice, 'Iade faturasi kuyruga alindi.')}
            />
          </section>

          <section className="accounting-lower-grid">
            <div className="panel">
              <h2>Cari hesaplar</h2>
              <DataTable
                rows={currentAccounts}
                emptyTitle="Cari hesap yok"
                emptyText="Musteri veya tedarikci cari karti ekleyerek tahsilat/odeme takibine baslayin."
                columns={[
                  { key: 'name', label: 'Cari' },
                  { key: 'type', label: 'Tip', render: (row) => row.type === 'supplier' ? 'Tedarikci' : 'Musteri' },
                  { key: 'tax_number', label: 'VKN', render: (row) => row.tax_number || '-' },
                  { key: 'identity_number', label: 'TCKN', render: (row) => row.identity_number || '-' },
                  { key: 'balance', label: 'Bakiye', render: (row) => formatMoney(row.balance) },
                ]}
              />
            </div>

            <div className="panel">
              <h2>Cari hareketler</h2>
              <DataTable
                rows={transactions}
                emptyTitle="Cari hareket yok"
                emptyText="Tahsilat, odeme veya duzeltme kayitlari olustukca burada gorunur."
                columns={[
                  { key: 'currentAccount', label: 'Cari', render: (row) => row.current_account?.name || row.currentAccount?.name || '-' },
                  { key: 'type', label: 'Tip' },
                  { key: 'direction', label: 'Yon', render: (row) => row.direction === 'credit' ? 'Alacak' : 'Borc' },
                  { key: 'amount', label: 'Tutar', render: (row) => formatMoney(row.amount) },
                  { key: 'description', label: 'Aciklama', render: (row) => row.description || '-' },
                ]}
              />
            </div>
          </section>

          <section className="accounting-form-grid">
            <form className="panel accounting-account-panel" onSubmit={saveCurrent}>
              <h2>Cari kart ekle</h2>
              <p>Fatura ve tahsilat islemleri icin musteri/tedarikci cari bilgilerini kaydedin.</p>
              <div className="form-grid">
                <Field label="Firma"><select value={currentForm.company_id} onChange={(event) => setCurrentForm({ ...currentForm, company_id: event.target.value })}><option value="">Seciniz</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
                <Field label="Tip"><select value={currentForm.type} onChange={(event) => setCurrentForm({ ...currentForm, type: event.target.value })}><option value="customer">Musteri</option><option value="supplier">Tedarikci</option></select></Field>
                <Field label="Ad Unvan"><input value={currentForm.name} onChange={(event) => setCurrentForm({ ...currentForm, name: event.target.value })} /></Field>
                <Field label="E-posta"><input value={currentForm.email} onChange={(event) => setCurrentForm({ ...currentForm, email: event.target.value })} /></Field>
                <Field label="Vergi Dairesi"><input value={currentForm.tax_office} onChange={(event) => setCurrentForm({ ...currentForm, tax_office: event.target.value })} /></Field>
                <Field label="VKN"><input value={currentForm.tax_number} onChange={(event) => setCurrentForm({ ...currentForm, tax_number: event.target.value })} /></Field>
                <Field label="TCKN"><input value={currentForm.identity_number} onChange={(event) => setCurrentForm({ ...currentForm, identity_number: event.target.value })} /></Field>
                <Field label="Adres"><textarea value={currentForm.address} onChange={(event) => setCurrentForm({ ...currentForm, address: event.target.value })} /></Field>
                <button disabled={loading}>Cari Kaydet</button>
              </div>
            </form>

            <form className="panel accounting-account-panel" onSubmit={saveAccount}>
              <h2>ERP hesabi ekle</h2>
              <p>Parasut, Logo, Mikro, Nebim veya QNB e-Finans bilgilerini kaydederek fatura surecini baslatin.</p>
              <div className="form-grid">
                <Field label="Firma"><select value={accountForm.company_id} onChange={(event) => setAccountForm({ ...accountForm, company_id: event.target.value })}><option value="">Seciniz</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
                <Field label="Servis"><select value={accountForm.accounting_integration_id} onChange={(event) => setAccountForm({ ...accountForm, accounting_integration_id: event.target.value })}><option value="">Seciniz</option>{integrations.map((integration) => <option key={integration.id} value={integration.id}>{integration.name}</option>)}</select></Field>
                <Field label="Hesap Adi"><input value={accountForm.name} onChange={(event) => setAccountForm({ ...accountForm, name: event.target.value })} /></Field>
                <Field label="Hesap Kodu"><input value={accountForm.client_id} onChange={(event) => setAccountForm({ ...accountForm, client_id: event.target.value })} /></Field>
                <Field label="Gizli Anahtar"><input type="password" value={accountForm.client_secret} onChange={(event) => setAccountForm({ ...accountForm, client_secret: event.target.value })} /></Field>
                <Field label="Kullanici"><input value={accountForm.username} onChange={(event) => setAccountForm({ ...accountForm, username: event.target.value })} /></Field>
                <Field label="Sifre"><input type="password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /></Field>
                <Field label="Baglanti Anahtari"><input value={accountForm.api_key} onChange={(event) => setAccountForm({ ...accountForm, api_key: event.target.value })} /></Field>
                <Field label="Servis Adresi"><input value={accountForm.base_url} onChange={(event) => setAccountForm({ ...accountForm, base_url: event.target.value })} /></Field>
                <button disabled={loading}>Hesap Kaydet</button>
              </div>
            </form>

            <form className="panel accounting-account-panel" onSubmit={addTransaction}>
              <h2>Tahsilat / odeme ekle</h2>
              <p>Cari hesap bakiyesini tahsilat, odeme veya duzeltme hareketleriyle guncelleyin.</p>
              <div className="form-grid">
                <Field label="Cari"><select value={transactionForm.current_account_id} onChange={(event) => setTransactionForm({ ...transactionForm, current_account_id: event.target.value })}><option value="">Seciniz</option>{currentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></Field>
                <Field label="Tip"><select value={transactionForm.type} onChange={(event) => setTransactionForm({ ...transactionForm, type: event.target.value })}><option value="collection">Tahsilat</option><option value="payment">Odeme</option><option value="adjustment">Duzeltme</option></select></Field>
                <Field label="Yon"><select value={transactionForm.direction} onChange={(event) => setTransactionForm({ ...transactionForm, direction: event.target.value })}><option value="credit">Alacak</option><option value="debit">Borc</option></select></Field>
                <Field label="Tutar"><input type="number" value={transactionForm.amount} onChange={(event) => setTransactionForm({ ...transactionForm, amount: event.target.value })} /></Field>
                <Field label="Aciklama"><input value={transactionForm.description} onChange={(event) => setTransactionForm({ ...transactionForm, description: event.target.value })} /></Field>
                <button disabled={loading}>Hareket Kaydet</button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}

function InvoiceDetailPanel({ invoice, logs, onQuery, onPdf, onDownload, onReturn }) {
  if (!invoice) {
    return (
      <aside className="panel accounting-detail-panel empty">
        <ReceiptText size={34} />
        <h2>Fatura detayini secin</h2>
        <p>Bir fatura kaydina tikladiginizda cari, ERP sonucu, PDF ve hata bilgileri burada gorunur.</p>
      </aside>
    );
  }

  const relatedLogs = invoiceLogs(invoice, logs);
  const latest = latestLog(invoice, logs);

  return (
    <aside className="panel accounting-detail-panel">
      <div className="accounting-detail-head">
        <div>
          <span className="eyebrow">Fatura detayi</span>
          <h2>{invoice.invoice_number || invoice.order?.marketplace_order_id || `Fatura #${invoice.id}`}</h2>
        </div>
        <StatusBadge tone={statusClass(invoice, logs)} label={statusLabel(invoice)} />
      </div>

      <div className="accounting-detail-grid">
        <DetailItem label="Cari" value={currentAccountName(invoice)} />
        <DetailItem label="Fatura Tipi" value={invoiceTypeLabels[invoice.type] || invoice.type || '-'} />
        <DetailItem label="Tutar" value={formatMoney(invoice.grand_total, invoice.currency)} />
        <DetailItem label="ERP Servisi" value={providerText(invoice)} />
        <DetailItem label="VKN/TCKN" value={invoice.current_account?.tax_number || invoice.current_account?.identity_number || '-'} />
        <DetailItem label="Tarih" value={formatDate(invoice.issued_at || invoice.created_at)} />
      </div>

      <div className={hasInvoiceError(invoice, logs) ? 'accounting-error-card' : 'accounting-success-card'}>
        {hasInvoiceError(invoice, logs) ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <div>
          <strong>{hasInvoiceError(invoice, logs) ? 'Fatura kontrol istiyor' : 'Fatura akisi normal'}</strong>
          <p>{hasInvoiceError(invoice, logs) ? errorSummary(invoice, logs) : 'Kritik ERP veya fatura hatasi gorunmuyor.'}</p>
        </div>
      </div>

      <div className="accounting-detail-grid">
        <DetailItem label="ERP Sonucu" value={latest ? `${latest.event} / ${latest.status || '-'}` : 'Log yok'} />
        <DetailItem label="PDF" value={hasPdf(invoice) ? 'Hazir' : 'Olusturulmadi'} />
        <DetailItem label="Fatura No" value={invoice.invoice_number || '-'} />
        <DetailItem label="External ID" value={invoice.external_id || '-'} />
      </div>

      <div className="accounting-detail-actions">
        <button type="button" disabled title="Siparis detayindan olusturulur"><Send size={15} /> Fatura Olustur</button>
        <button type="button" onClick={() => onQuery(invoice.id)}><RotateCcw size={15} /> Durum Sorgula</button>
        <button type="button" onClick={() => onPdf(invoice.id)}><FileText size={15} /> PDF Hazirla</button>
        <button type="button" className="secondary" onClick={() => onDownload(invoice.id)} disabled={!hasPdf(invoice)}><Download size={15} /> PDF Indir</button>
        <button type="button" className="secondary" onClick={() => onReturn(invoice.id)} disabled={invoice.type === 'return'}><Undo2 size={15} /> Iade Faturasi</button>
        <RouterLink className="button-link secondary-link" to="/api-logs"><ReceiptText size={15} /> Loglari Gor</RouterLink>
      </div>

      <details className="json-collapse">
        <summary>Fatura log ozeti ({relatedLogs.length})</summary>
        <pre>{JSON.stringify(relatedLogs.slice(0, 5), null, 2)}</pre>
      </details>
    </aside>
  );
}
