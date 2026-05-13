import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Eye,
  ExternalLink,
  Filter,
  LockKeyhole,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  Undo2,
  WalletCards,
  Webhook,
} from 'lucide-react';
import { Link as RouterLink } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const initialForm = {
  company_id: '',
  payment_provider_id: '',
  name: '',
  merchant_id: '',
  api_key: '',
  api_secret: '',
  client_id: '',
  client_secret: '',
  base_url: '',
  webhook_secret: '',
};

const providerFilters = [
  { value: 'all', label: 'Tum saglayicilar' },
  { value: 'iyzico', label: 'iyzico' },
  { value: 'paytr', label: 'PayTR' },
  { value: 'param', label: 'Param' },
  { value: 'sipay', label: 'Sipay' },
  { value: 'paynet', label: 'Paynet' },
  { value: 'bank_pos', label: 'Banka POS' },
  { value: 'bank_transfer', label: 'Havale/EFT' },
  { value: 'cash_on_delivery', label: 'Kapida odeme' },
];

const statusFilters = [
  { value: 'all', label: 'Tum durumlar' },
  { value: 'paid', label: 'Basarili' },
  { value: 'pending', label: 'Bekleyen' },
  { value: 'failed', label: 'Basarisiz' },
  { value: 'refunded', label: 'Iade edilen' },
  { value: 'three_d_pending', label: '3D Secure bekleyen' },
  { value: 'callback_error', label: 'Callback hatasi' },
];

const statusLabels = {
  paid: 'Basarili',
  pending: 'Bekliyor',
  failed: 'Basarisiz',
  refunded: 'Iade edildi',
  partially_refunded: 'Kismi iade',
  cancelled: 'Iptal',
  rejected: 'Reddedildi',
};

const methodLabels = {
  card: 'Kart',
  three_d: '3D Secure',
  bank_transfer: 'Havale/EFT',
  cash_on_delivery: 'Kapida odeme',
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

function providerText(payment) {
  return payment.account?.provider?.name || payment.provider_name || payment.provider_code || '-';
}

function providerCode(payment) {
  return payment.provider_code || payment.account?.provider?.code || '';
}

function providerMatches(payment, provider) {
  if (provider === 'all') {
    return true;
  }

  const haystack = normalize([
    providerCode(payment),
    providerText(payment),
    payment.method,
  ].join(' '));

  if (provider === 'bank_pos') {
    return haystack.includes('bank') || haystack.includes('pos');
  }

  if (provider === 'bank_transfer') {
    return payment.method === 'bank_transfer' || haystack.includes('havale') || haystack.includes('eft');
  }

  if (provider === 'cash_on_delivery') {
    return payment.method === 'cash_on_delivery' || haystack.includes('kapida');
  }

  return haystack.includes(provider);
}

function isThreeDPending(payment) {
  return payment.method === 'three_d' && payment.status === 'pending';
}

function paymentLogs(payment, logs) {
  return logs.filter((log) => Number(log.payment_id) === Number(payment?.id));
}

function hasCallbackError(payment, logs) {
  return paymentLogs(payment, logs).some((log) => log.event === 'callback' && (log.status === 'rejected' || log.error_message));
}

function hasPaymentError(payment, logs) {
  return payment.status === 'failed' || Boolean(payment.error_message) || paymentLogs(payment, logs).some((log) => log.error_message);
}

function statusMatches(payment, status, logs) {
  if (status === 'all') {
    return true;
  }

  if (status === 'three_d_pending') {
    return isThreeDPending(payment);
  }

  if (status === 'callback_error') {
    return hasCallbackError(payment, logs);
  }

  if (status === 'refunded') {
    return ['refunded', 'partially_refunded'].includes(payment.status);
  }

  return payment.status === status;
}

function statusLabel(payment) {
  return statusLabels[payment.status] || payment.status || 'Bilinmiyor';
}

function statusClass(payment, logs) {
  if (hasPaymentError(payment, logs)) {
    return 'failed';
  }
  if (['paid', 'refunded', 'partially_refunded'].includes(payment.status)) {
    return 'paid';
  }
  if (payment.status === 'pending') {
    return 'pending';
  }
  return payment.status || 'unknown';
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

function errorSummary(payment, logs) {
  const relatedLogs = paymentLogs(payment, logs);
  return payment.error_message || relatedLogs.find((log) => log.error_message)?.error_message || 'Hata detayi bulunmuyor.';
}

function latestLog(payment, logs) {
  return paymentLogs(payment, logs)[0] || null;
}

export function PaymentsPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [filters, setFilters] = useState({
    provider: 'all',
    status: 'all',
    search: '',
  });

  const load = async () => {
    await run(async () => {
      const [companyResponse, providerResponse, accountResponse, paymentResponse, logResponse] = await Promise.all([
        api.companies.list(),
        api.payments.providers(),
        api.payments.accounts(),
        api.payments.list(),
        api.payments.logs(),
      ]);
      const nextPayments = paymentResponse.data || [];

      setCompanies(companyResponse.data || []);
      setProviders(providerResponse || []);
      setAccounts(accountResponse.data || []);
      setPayments(nextPayments);
      setLogs(logResponse.data || []);
      setSelectedPayment((current) => {
        if (!nextPayments.length) {
          return null;
        }

        return nextPayments.find((payment) => payment.id === current?.id) || nextPayments[0];
      });
      setForm((current) => ({
        ...current,
        payment_provider_id: current.payment_provider_id || providerResponse?.[0]?.id || '',
      }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPayments = useMemo(() => {
    const query = normalize(filters.search);

    return payments.filter((payment) => {
      const searchText = normalize([
        payment.id,
        payment.order?.marketplace_order_id,
        payment.order?.customer_name,
        payment.transaction_id,
        payment.conversation_id,
        providerText(payment),
        payment.amount,
      ].join(' '));

      return providerMatches(payment, filters.provider)
        && statusMatches(payment, filters.status, logs)
        && (!query || searchText.includes(query));
    });
  }, [filters, logs, payments]);

  const metrics = useMemo(() => ({
    paid: payments.filter((payment) => payment.status === 'paid').length,
    pending: payments.filter((payment) => payment.status === 'pending').length,
    failed: payments.filter((payment) => hasPaymentError(payment, logs)).length,
    refunded: payments.filter((payment) => ['refunded', 'partially_refunded'].includes(payment.status)).length,
    threeD: payments.filter(isThreeDPending).length,
    callback: payments.filter((payment) => hasCallbackError(payment, logs)).length,
  }), [logs, payments]);

  const successRate = payments.length ? Math.round((metrics.paid / payments.length) * 100) : 0;

  const createAccount = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.payments.createAccount({
        ...form,
        installment_rates: { 1: 0, 2: 2.5, 3: 3.5 },
        commission_rates: { 1: 0, 2: 2.5, 3: 3.5 },
        settings: { endpoints: {} },
      });
      setForm(initialForm);
      notify('success', 'POS hesabi kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const action = async (paymentId, fn, payload, fallback) => {
    await run(async () => {
      const response = await fn(paymentId, payload);
      notify('success', response.message || fallback);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const refundAmount = (payment, ratio = 1) => {
    const remaining = Number(payment.amount || 0) - Number(payment.refunded_amount || 0);
    return Math.max(0.01, Number((remaining * ratio).toFixed(2)));
  };

  return (
    <div className="payment-page">
      <PageHeader
        title="Odeme Operasyon Merkezi"
        description="POS, 3D Secure, callback, iade ve odeme hata sureclerini tek ekrandan izleyin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />

      <section className="payment-hero">
        <div>
          <span className="eyebrow">Canli odeme akisi</span>
          <h2>POS ve alternatif odeme islemlerini tek merkezden yonetin.</h2>
          <p>iyzico, PayTR, Param, Sipay, Paynet, banka POS, havale/EFT ve kapida odeme kayitlarini durum ve saglayici bazinda takip edin.</p>
          <div className="payment-hero-actions">
            <button type="button" onClick={() => setFilters({ provider: 'all', status: 'failed', search: '' })}>
              <AlertTriangle size={16} /> Kritik Hatalar
            </button>
            <RouterLink className="button-link secondary-link" to="/api-logs">API Loglari</RouterLink>
          </div>
        </div>
        <div className="payment-hero-status">
          <ShieldCheck size={28} />
          <strong>%{successRate}</strong>
          <span>Odeme basari orani</span>
          <small>{accounts.length} POS hesabi, {metrics.callback} callback hatasi takipte.</small>
          <div className="progress"><span style={{ width: `${successRate}%` }} /></div>
        </div>
      </section>

      <section className="payment-stat-grid">
        <PaymentStat icon={<CheckCircle2 size={18} />} label="Basarili odemeler" value={metrics.paid} tone="green" />
        <PaymentStat icon={<RefreshCcw size={18} />} label="Bekleyen odemeler" value={metrics.pending} tone="orange" />
        <PaymentStat icon={<AlertTriangle size={18} />} label="Basarisiz odemeler" value={metrics.failed} tone="red" />
        <PaymentStat icon={<Undo2 size={18} />} label="Iade edilenler" value={metrics.refunded} tone="purple" />
        <PaymentStat icon={<LockKeyhole size={18} />} label="3D Secure bekleyen" value={metrics.threeD} tone="blue" />
        <PaymentStat icon={<Webhook size={18} />} label="Callback hatalari" value={metrics.callback} tone="red" />
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && accounts.length === 0 && payments.length === 0 ? <LoadingState /> : (
        <>
          <section className="panel payment-filter-panel">
            <div>
              <h2>Odeme kayitlari</h2>
              <p>Saglayici, durum, siparis no, musteri veya islem numarasina gore filtreleyin.</p>
            </div>
            <div className="payment-filter-row">
              <label>
                <Filter size={15} />
                <select value={filters.provider} onChange={(event) => setFilters({ ...filters, provider: event.target.value })}>
                  {providerFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <CreditCard size={15} />
                <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  {statusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="payment-search">
                <Search size={15} />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Siparis no, musteri, islem no veya saglayici ara"
                />
              </label>
            </div>
          </section>

          <section className="payment-layout">
            <div className="panel payment-table-panel">
              <div className="payment-table-header">
                <div>
                  <h2>Odeme listesi</h2>
                  <p>{filteredPayments.length} odeme kaydi goruntuleniyor.</p>
                </div>
                <span className={metrics.failed || metrics.callback ? 'badge failed' : 'badge active'}>
                  {metrics.failed || metrics.callback ? 'Kontrol gerekli' : 'Saglikli'}
                </span>
              </div>
              <DataTable
                rows={filteredPayments}
                emptyTitle="Odeme kaydi yok"
                emptyText="Siparislerden odeme olusturuldugunda POS ve alternatif odeme kayitlari burada gorunur."
                columns={[
                  {
                    key: 'order',
                    label: 'Siparis No',
                    render: (row) => (
                      <button type="button" className="text-link" onClick={() => setSelectedPayment(row)}>
                        {row.order?.marketplace_order_id || `#${row.order_id || row.id}`}
                      </button>
                    ),
                  },
                  { key: 'customer', label: 'Musteri', render: (row) => row.order?.customer_name || '-' },
                  { key: 'provider', label: 'Saglayici', render: providerText },
                  { key: 'amount', label: 'Tutar', render: (row) => formatMoney(row.amount, row.currency) },
                  { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${statusClass(row, logs)}`}>{statusLabel(row)}</span> },
                  { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.created_at) },
                  { key: 'transaction_id', label: 'Islem No', render: (row) => row.transaction_id || row.conversation_id || '-' },
                  {
                    key: 'actions',
                    label: 'Islem',
                    render: (row) => (
                      <div className="row-actions payment-row-actions">
                        <button type="button" title="Durum sorgula" onClick={() => action(row.id, api.payments.query, null, 'Sorgu kuyruga alindi.')}>
                          <RotateCcw size={15} />
                        </button>
                        <button type="button" title="Iade baslat" onClick={() => action(row.id, api.payments.refund, { amount: refundAmount(row) }, 'Iade islendi.')} disabled={!['paid', 'partially_refunded'].includes(row.status)}>
                          <Undo2 size={15} />
                        </button>
                        <button type="button" title="Kismi iade" onClick={() => action(row.id, api.payments.refund, { amount: refundAmount(row, 0.5) }, 'Kismi iade islendi.')} disabled={!['paid', 'partially_refunded'].includes(row.status)}>
                          <Banknote size={15} />
                        </button>
                        <button type="button" title="Detay gor" onClick={() => setSelectedPayment(row)}>
                          <Eye size={15} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <PaymentDetailPanel
              payment={selectedPayment}
              logs={logs}
              onQuery={(id) => action(id, api.payments.query, null, 'Sorgu kuyruga alindi.')}
              onRefund={(payment) => action(payment.id, api.payments.refund, { amount: refundAmount(payment) }, 'Iade islendi.')}
              onPartialRefund={(payment) => action(payment.id, api.payments.refund, { amount: refundAmount(payment, 0.5) }, 'Kismi iade islendi.')}
            />
          </section>

          <section className="payment-lower-grid">
            <div className="panel">
              <h2>POS hesaplari</h2>
              <DataTable
                rows={accounts}
                emptyTitle="POS hesabi yok"
                emptyText="Odeme saglayici bilgilerinizi ekleyerek POS ve alternatif odeme islemlerini baslatin."
                columns={[
                  { key: 'name', label: 'Hesap' },
                  { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
                  { key: 'provider', label: 'Saglayici', render: (row) => row.provider?.name || '-' },
                  { key: 'merchant_id', label: 'Merchant', render: (row) => row.merchant_id || '-' },
                  { key: 'base_url', label: 'Ortam', render: (row) => row.base_url || 'Mock/Fallback' },
                ]}
              />
            </div>

            <div className="panel payment-account-panel">
              <h2>Yeni POS hesabi</h2>
              <p>API bilgilerini kaydederek odeme, sorgu, iade ve callback sureclerini baslatin.</p>
              <form className="form-grid" onSubmit={createAccount}>
                <Field label="Firma">
                  <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
                    <option value="">Seciniz</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </Field>
                <Field label="Saglayici">
                  <select value={form.payment_provider_id} onChange={(event) => setForm({ ...form, payment_provider_id: event.target.value })}>
                    <option value="">Seciniz</option>
                    {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                  </select>
                </Field>
                <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Merchant ID"><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
                <Field label="Baglanti Anahtari"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
                <Field label="Gizli Anahtar"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
                <Field label="Client ID"><input value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} /></Field>
                <Field label="Client Secret"><input type="password" value={form.client_secret} onChange={(event) => setForm({ ...form, client_secret: event.target.value })} /></Field>
                <Field label="Servis Adresi"><input value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} /></Field>
                <Field label="Bildirim Anahtari"><input type="password" value={form.webhook_secret} onChange={(event) => setForm({ ...form, webhook_secret: event.target.value })} /></Field>
                <button disabled={loading}>POS Hesabi Ekle</button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PaymentStat({ icon, label, value, tone }) {
  return (
    <div className={`payment-stat-card ${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  );
}

function PaymentDetailPanel({ payment, logs, onQuery, onRefund, onPartialRefund }) {
  if (!payment) {
    return (
      <aside className="panel payment-detail-panel empty">
        <WalletCards size={34} />
        <h2>Odeme detayini secin</h2>
        <p>Bir odeme kaydina tikladiginizda 3D Secure, callback, iade ve hata bilgileri burada gorunur.</p>
      </aside>
    );
  }

  const relatedLogs = paymentLogs(payment, logs);
  const latest = latestLog(payment, logs);
  const canRefund = ['paid', 'partially_refunded'].includes(payment.status);

  return (
    <aside className="panel payment-detail-panel">
      <div className="payment-detail-head">
        <div>
          <span className="eyebrow">Odeme detayi</span>
          <h2>{payment.order?.marketplace_order_id || `Odeme #${payment.id}`}</h2>
        </div>
        <span className={`badge ${statusClass(payment, logs)}`}>{statusLabel(payment)}</span>
      </div>

      <div className="payment-detail-grid">
        <DetailItem label="Saglayici" value={providerText(payment)} />
        <DetailItem label="Tutar" value={formatMoney(payment.amount, payment.currency)} />
        <DetailItem label="Yontem" value={methodLabels[payment.method] || payment.method || '-'} />
        <DetailItem label="Taksit" value={payment.installment_count || 1} />
        <DetailItem label="Islem No" value={payment.transaction_id || payment.conversation_id || '-'} />
        <DetailItem label="Tarih" value={formatDate(payment.created_at)} />
      </div>

      <div className={hasPaymentError(payment, logs) || hasCallbackError(payment, logs) ? 'payment-error-card' : 'payment-success-card'}>
        {hasPaymentError(payment, logs) || hasCallbackError(payment, logs) ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
        <div>
          <strong>{hasPaymentError(payment, logs) || hasCallbackError(payment, logs) ? 'Odeme kontrol istiyor' : 'Odeme akisi normal'}</strong>
          <p>{hasPaymentError(payment, logs) || hasCallbackError(payment, logs) ? errorSummary(payment, logs) : 'Kritik POS veya callback hatasi gorunmuyor.'}</p>
        </div>
      </div>

      <div className="payment-detail-grid">
        <DetailItem label="3D Secure" value={payment.method === 'three_d' ? (payment.three_d_html || payment.payment_url ? 'Baslatildi' : 'Bekliyor') : 'Kullanilmadi'} />
        <DetailItem label="Callback" value={hasCallbackError(payment, logs) ? 'Hatali' : latest?.event === 'callback' ? 'Alindi' : 'Bekleniyor'} />
        <DetailItem label="Iade" value={payment.refunded_amount ? formatMoney(payment.refunded_amount, payment.currency) : 'Yok'} />
        <DetailItem label="Son Log" value={latest ? `${latest.event} / ${latest.status || '-'}` : 'Log yok'} />
      </div>

      {payment.payment_url && (
        <a className="payment-link-card" href={payment.payment_url} target="_blank" rel="noreferrer">
          <ExternalLink size={17} />
          <span>Odeme linkini ac</span>
        </a>
      )}

      <div className="payment-detail-actions">
        <button type="button" onClick={() => onQuery(payment.id)}><RotateCcw size={15} /> Durum Sorgula</button>
        <button type="button" onClick={() => onRefund(payment)} disabled={!canRefund}><Undo2 size={15} /> Iade Baslat</button>
        <button type="button" className="secondary" onClick={() => onPartialRefund(payment)} disabled={!canRefund}><Banknote size={15} /> Kismi Iade</button>
        <RouterLink className="button-link secondary-link" to="/api-logs"><ReceiptText size={15} /> Loglari Gor</RouterLink>
      </div>

      <details className="json-collapse">
        <summary>Odeme log ozeti ({relatedLogs.length})</summary>
        <pre>{JSON.stringify(relatedLogs.slice(0, 5), null, 2)}</pre>
      </details>
    </aside>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
