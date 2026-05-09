import { useEffect, useState } from 'react';
import { Download, FileText, RotateCcw, Undo2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const currentInitial = { company_id: '', type: 'customer', name: '', email: '', tax_office: '', tax_number: '', identity_number: '', address: '', city: '', district: '' };
const accountInitial = { company_id: '', accounting_integration_id: '', name: '', client_id: '', client_secret: '', username: '', password: '', api_key: '', api_secret: '', base_url: '' };

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

  const load = async () => {
    await run(async () => {
      const [companyResponse, integrationResponse, accountResponse, currentResponse, transactionResponse, invoiceResponse, logResponse] = await Promise.all([
        api.companies.list(), api.accounting.integrations(), api.accounting.accounts(), api.accounting.currentAccounts(),
        api.accounting.transactions(), api.accounting.invoices(), api.accounting.logs(),
      ]);
      setCompanies(companyResponse.data || []);
      setIntegrations(integrationResponse || []);
      setAccounts(accountResponse.data || []);
      setCurrentAccounts(currentResponse.data || []);
      setTransactions(transactionResponse.data || []);
      setInvoices(invoiceResponse.data || []);
      setLogs(logResponse.data || []);
      setAccountForm((current) => ({ ...current, accounting_integration_id: current.accounting_integration_id || integrationResponse?.[0]?.id || '' }));
    });
  };

  useEffect(() => { load(); }, []);

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
    <>
      <PageHeader title="Cari ve Fatura Yonetimi" />
      <section className="split">
        <form className="panel compact-panel" onSubmit={saveCurrent}>
          <h2>Cari Kart</h2>
          <Field label="Firma"><select value={currentForm.company_id} onChange={(e) => setCurrentForm({ ...currentForm, company_id: e.target.value })}><option value="">Seciniz</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Tip"><select value={currentForm.type} onChange={(e) => setCurrentForm({ ...currentForm, type: e.target.value })}><option value="customer">Musteri</option><option value="supplier">Tedarikci</option></select></Field>
          <Field label="Ad Unvan"><input value={currentForm.name} onChange={(e) => setCurrentForm({ ...currentForm, name: e.target.value })} /></Field>
          <Field label="E-posta"><input value={currentForm.email} onChange={(e) => setCurrentForm({ ...currentForm, email: e.target.value })} /></Field>
          <Field label="Vergi Dairesi"><input value={currentForm.tax_office} onChange={(e) => setCurrentForm({ ...currentForm, tax_office: e.target.value })} /></Field>
          <Field label="VKN"><input value={currentForm.tax_number} onChange={(e) => setCurrentForm({ ...currentForm, tax_number: e.target.value })} /></Field>
          <Field label="TCKN"><input value={currentForm.identity_number} onChange={(e) => setCurrentForm({ ...currentForm, identity_number: e.target.value })} /></Field>
          <Field label="Adres"><textarea value={currentForm.address} onChange={(e) => setCurrentForm({ ...currentForm, address: e.target.value })} /></Field>
          <button disabled={loading}>Cari Kaydet</button>
        </form>

        <form className="panel compact-panel" onSubmit={saveAccount}>
          <h2>Muhasebe Entegrasyonu</h2>
          <Field label="Firma"><select value={accountForm.company_id} onChange={(e) => setAccountForm({ ...accountForm, company_id: e.target.value })}><option value="">Seciniz</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Servis"><select value={accountForm.accounting_integration_id} onChange={(e) => setAccountForm({ ...accountForm, accounting_integration_id: e.target.value })}><option value="">Seciniz</option>{integrations.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
          <Field label="Hesap Adi"><input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} /></Field>
          <Field label="Client ID"><input value={accountForm.client_id} onChange={(e) => setAccountForm({ ...accountForm, client_id: e.target.value })} /></Field>
          <Field label="Client Secret"><input type="password" value={accountForm.client_secret} onChange={(e) => setAccountForm({ ...accountForm, client_secret: e.target.value })} /></Field>
          <Field label="Kullanici"><input value={accountForm.username} onChange={(e) => setAccountForm({ ...accountForm, username: e.target.value })} /></Field>
          <Field label="Sifre"><input type="password" value={accountForm.password} onChange={(e) => setAccountForm({ ...accountForm, password: e.target.value })} /></Field>
          <Field label="API Key"><input value={accountForm.api_key} onChange={(e) => setAccountForm({ ...accountForm, api_key: e.target.value })} /></Field>
          <Field label="Base URL"><input value={accountForm.base_url} onChange={(e) => setAccountForm({ ...accountForm, base_url: e.target.value })} /></Field>
          <button disabled={loading}>Entegrasyon Kaydet</button>
        </form>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && currentAccounts.length === 0 ? <LoadingState /> : (
      <>
        <section className="panel">
          <h2>Tahsilat / Odeme</h2>
          <form className="form-grid" onSubmit={addTransaction}>
            <Field label="Cari"><select value={transactionForm.current_account_id} onChange={(e) => setTransactionForm({ ...transactionForm, current_account_id: e.target.value })}><option value="">Seciniz</option>{currentAccounts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
            <Field label="Tip"><select value={transactionForm.type} onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}><option value="collection">Tahsilat</option><option value="payment">Odeme</option><option value="adjustment">Duzeltme</option></select></Field>
            <Field label="Yon"><select value={transactionForm.direction} onChange={(e) => setTransactionForm({ ...transactionForm, direction: e.target.value })}><option value="credit">Alacak</option><option value="debit">Borc</option></select></Field>
            <Field label="Tutar"><input type="number" value={transactionForm.amount} onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })} /></Field>
            <Field label="Aciklama"><input value={transactionForm.description} onChange={(e) => setTransactionForm({ ...transactionForm, description: e.target.value })} /></Field>
            <button disabled={loading}>Hareket Kaydet</button>
          </form>
        </section>

        <section className="panel"><h2>Cari Hesaplar</h2><DataTable rows={currentAccounts} columns={[{ key: 'name', label: 'Cari' }, { key: 'type', label: 'Tip' }, { key: 'tax_number', label: 'VKN' }, { key: 'identity_number', label: 'TCKN' }, { key: 'balance', label: 'Bakiye' }]} /></section>
        <section className="panel"><h2>Cari Hareketler</h2><DataTable rows={transactions} columns={[{ key: 'currentAccount', label: 'Cari', render: (r) => r.current_account?.name || r.currentAccount?.name }, { key: 'type', label: 'Tip' }, { key: 'direction', label: 'Yon' }, { key: 'amount', label: 'Tutar' }, { key: 'description', label: 'Aciklama' }]} /></section>
        <section className="panel"><h2>Faturalar</h2><DataTable rows={invoices} columns={[{ key: 'invoice_number', label: 'No', render: (r) => r.invoice_number || '-' }, { key: 'currentAccount', label: 'Cari', render: (r) => r.current_account?.name || r.currentAccount?.name }, { key: 'type', label: 'Tip' }, { key: 'grand_total', label: 'Toplam' }, { key: 'status', label: 'Durum', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> }, { key: 'actions', label: 'Islem', render: (r) => <div className="row-actions"><button type="button" onClick={() => invoiceAction(r.id, api.accounting.queryInvoice, 'Sorgu kuyruga alindi.')}><RotateCcw size={15} /> Sorgu</button><button type="button" onClick={() => invoiceAction(r.id, api.accounting.createPdf, 'PDF kuyruga alindi.')}><FileText size={15} /> PDF</button><button type="button" onClick={() => downloadPdf(r.id)}><Download size={15} /> Indir</button><button type="button" onClick={() => invoiceAction(r.id, api.accounting.returnInvoice, 'Iade faturasi kuyruga alindi.')}><Undo2 size={15} /> Iade</button></div> }]} /></section>
        <section className="panel"><h2>Muhasebe Loglari</h2><DataTable rows={logs} columns={[{ key: 'provider_code', label: 'Servis' }, { key: 'event', label: 'Event' }, { key: 'status', label: 'Durum' }, { key: 'duration_ms', label: 'Sure' }, { key: 'error_message', label: 'Hata', render: (r) => r.error_message || '-' }]} /></section>
      </>
      )}
    </>
  );
}
