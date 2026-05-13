import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe2,
  KeyRound,
  Link2,
  LockKeyhole,
  Mail,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Store,
  Webhook,
} from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  { key: 'companies', label: 'Firmalar', icon: Building2 },
  { key: 'integrations', label: 'Entegrasyon Hesaplari', icon: Link2 },
  { key: 'general', label: 'Genel Ayarlar', icon: Settings2 },
  { key: 'security', label: 'Guvenlik', icon: ShieldCheck },
];

function valueFrom(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function rowsFrom(response) {
  return response?.data || [];
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function mask(value, revealed) {
  if (!value) return '-';
  if (revealed) return value;
  if (String(value).includes('*')) return value;
  return `${String(value).slice(0, 3)}********`;
}

function latestDate(items) {
  const timestamps = items.map((item) => new Date(item.updated_at || item.created_at || 0).getTime()).filter(Boolean);
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
}

function companyPlan(company, subscriptions) {
  const subscription = subscriptions.find((item) => Number(item.company_id) === Number(company.id) && ['trial', 'active'].includes(item.status));
  return subscription?.plan?.name || '-';
}

function companyLicense(company, licenses) {
  return licenses.find((item) => Number(item.company_id) === Number(company.id) && item.status === 'active');
}

function companyMarketplaceCount(company, marketplaces) {
  return marketplaces.filter((item) => Number(item.company_id) === Number(company.id) && item.is_active !== false).length;
}

function companyOrderCount(company, orders) {
  return orders.filter((item) => Number(item.company_id) === Number(company.id)).length;
}

function normalizeProvider(value) {
  return {
    trendyol: 'Trendyol',
    hepsiburada: 'Hepsiburada',
    ciceksepeti: 'Ciceksepeti',
  }[value] || value || '-';
}

function accountCompanyName(account) {
  return account.company?.name || '-';
}

function integrationStatus(account) {
  if (account.error_message || account.last_error || account.metadata?.last_error) return 'failed';
  if (account.is_active === false || account.status === 'passive') return 'passive';
  return account.status || 'active';
}

function statusLabel(status) {
  return {
    active: 'Aktif',
    passive: 'Pasif',
    failed: 'Hatali',
    connected: 'Bagli',
    available: 'Kullanilabilir',
  }[status] || status || '-';
}

export function SettingsPage({ audience = 'admin' }) {
  const { loading, error, run } = useAsync();
  const [activeTab, setActiveTab] = useState('companies');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [data, setData] = useState({
    companies: [],
    marketplaces: [],
    shippingAccounts: [],
    paymentAccounts: [],
    accountingAccounts: [],
    xmlSources: [],
    subscriptions: [],
    licenses: [],
    orders: [],
  });

  const basePath = audience === 'customer' ? '/app' : '';

  const load = async () => {
    await run(async () => {
      const [
        companies,
        marketplaces,
        shippingAccounts,
        paymentAccounts,
        accountingAccounts,
        xmlSources,
        subscriptions,
        licenses,
        orders,
      ] = await Promise.allSettled([
        api.companies.list(),
        api.marketplaces.list(),
        api.shipping.accounts(),
        api.payments.accounts(),
        api.accounting.accounts(),
        api.xmlSources.list(),
        api.saas.subscriptions(),
        api.saas.licenses(),
        api.orders.list({}),
      ]);

      const nextData = {
        companies: rowsFrom(valueFrom(companies, {})),
        marketplaces: rowsFrom(valueFrom(marketplaces, {})),
        shippingAccounts: rowsFrom(valueFrom(shippingAccounts, {})),
        paymentAccounts: rowsFrom(valueFrom(paymentAccounts, {})),
        accountingAccounts: rowsFrom(valueFrom(accountingAccounts, {})),
        xmlSources: rowsFrom(valueFrom(xmlSources, {})),
        subscriptions: rowsFrom(valueFrom(subscriptions, {})),
        licenses: rowsFrom(valueFrom(licenses, {})),
        orders: rowsFrom(valueFrom(orders, {})),
      };

      setData(nextData);
      setSelectedCompany((current) => current || nextData.companies[0] || null);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const integrationAccounts = useMemo(() => [
    ...data.marketplaces.map((account) => ({
      id: `marketplace-${account.id}`,
      raw: account,
      group: 'Pazaryeri',
      provider: normalizeProvider(account.code),
      name: account.name,
      company: accountCompanyName(account),
      status: integrationStatus(account),
      lastTest: account.metadata?.last_tested_at,
      lastSync: account.metadata?.last_sync_at || account.updated_at,
      error: account.metadata?.last_error,
      credentials: {
        api_key: account.api_key,
        api_secret: account.api_secret,
        supplier_id: account.supplier_id,
        merchant_id: account.merchant_id,
      },
      manageTo: `${basePath}/marketplaces`,
    })),
    ...data.shippingAccounts.map((account) => ({
      id: `shipping-${account.id}`,
      raw: account,
      group: 'Kargo',
      provider: account.carrier?.name || account.carrier_code || 'Kargo',
      name: account.name,
      company: accountCompanyName(account),
      status: integrationStatus(account),
      lastTest: account.last_tested_at,
      lastSync: account.updated_at,
      error: account.last_error,
      credentials: {
        customer_code: account.customer_code,
        username: account.username,
        api_key: account.api_key,
      },
      manageTo: `${basePath}/shipping`,
    })),
    ...data.paymentAccounts.map((account) => ({
      id: `payment-${account.id}`,
      raw: account,
      group: 'POS',
      provider: account.provider?.name || 'POS',
      name: account.name,
      company: accountCompanyName(account),
      status: integrationStatus(account),
      lastTest: account.last_tested_at,
      lastSync: account.updated_at,
      error: account.last_error,
      credentials: {
        merchant_id: account.merchant_id,
        api_key: account.api_key,
        client_id: account.client_id,
      },
      manageTo: `${basePath}/payments`,
    })),
    ...data.accountingAccounts.map((account) => ({
      id: `accounting-${account.id}`,
      raw: account,
      group: 'ERP',
      provider: account.integration?.name || 'ERP',
      name: account.name,
      company: accountCompanyName(account),
      status: integrationStatus(account),
      lastTest: account.last_tested_at,
      lastSync: account.updated_at,
      error: account.last_error,
      credentials: {
        client_id: account.client_id,
        username: account.username,
        api_key: account.api_key,
      },
      manageTo: `${basePath}/accounting`,
    })),
    ...data.xmlSources.map((source) => ({
      id: `xml-${source.id}`,
      raw: source,
      group: 'XML',
      provider: 'XML Kaynagi',
      name: source.name || source.supplier_name || 'XML',
      company: accountCompanyName(source),
      status: source.is_active === false ? 'passive' : 'active',
      lastTest: source.last_preview_at,
      lastSync: source.last_imported_at || source.updated_at,
      error: source.last_error,
      credentials: {
        xml_url: source.url || source.xml_url,
      },
      manageTo: `${basePath}/products/import`,
    })),
  ], [basePath, data]);

  const selectedCompanyIntegrations = selectedCompany
    ? integrationAccounts.filter((account) => Number(account.raw.company_id) === Number(selectedCompany.id))
    : [];

  const settingsCards = [
    { title: 'Bildirim Ayarlari', text: 'E-posta, panel ve operasyon uyarilari icin merkezi bildirim kurallari.', icon: Bell, enabled: false },
    { title: 'E-posta Ayarlari', text: 'SMTP, gonderici adresi ve sablon baglantilari.', icon: Mail, enabled: false },
    { title: 'Webhook Ayarlari', text: 'Siparis, urun, fatura ve kargo olaylari icin webhook hedefleri.', icon: Webhook, enabled: false },
    { title: 'Dil / Lokasyon', text: 'Dil, tarih formati, saat dilimi ve bolgesel ayarlar.', icon: Globe2, enabled: false },
    { title: 'Doviz', text: 'Para birimi ve kur guncelleme tercihleri.', icon: Store, enabled: false },
    { title: 'Tema / Arayuz', text: 'Panel gorunumu, tablo yogunlugu ve tema tercihleri.', icon: Settings2, enabled: false },
  ];

  const metrics = {
    companies: data.companies.length,
    integrations: integrationAccounts.length,
    warnings: integrationAccounts.filter((account) => account.status === 'failed').length,
    licenses: data.licenses.filter((license) => license.status === 'active').length,
  };

  return (
    <div className="settings-center-page">
      <PageHeader
        title="Sistem ve Firma Yonetim Merkezi"
        description="Firma bilgileri, entegrasyon hesaplari, credential guvenligi ve genel sistem ayarlarini tek merkezden yonetin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />

      <section className="settings-center-hero">
        <div>
          <span className="eyebrow">Yonetim ve guvenlik merkezi</span>
          <h2>Firma, entegrasyon ve ayar sagligini tek ekranda izleyin.</h2>
          <p>Vergi/iletisim bilgileri, pazaryeri ve servis hesaplari, API credential maskeleri ve genel sistem ayarlari merkezi olarak kontrol edilir.</p>
        </div>
        <div className="settings-center-status">
          <ShieldCheck size={28} />
          <strong>{metrics.integrations}</strong>
          <span>Toplam entegrasyon hesabi</span>
          <small>{metrics.warnings} hesap kontrol istiyor, {metrics.licenses} aktif lisans var.</small>
        </div>
      </section>

      <section className="settings-center-stat-grid">
        <SettingsStat icon={<Building2 size={18} />} label="Firma" value={metrics.companies} tone="blue" />
        <SettingsStat icon={<Link2 size={18} />} label="Entegrasyon" value={metrics.integrations} tone="purple" />
        <SettingsStat icon={<AlertTriangle size={18} />} label="Kritik uyari" value={metrics.warnings} tone="red" />
        <SettingsStat icon={<KeyRound size={18} />} label="Aktif lisans" value={metrics.licenses} tone="green" />
      </section>

      <section className="settings-center-layout">
        <aside className="settings-center-nav panel">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button type="button" className={activeTab === key ? 'active' : ''} key={key} onClick={() => setActiveTab(key)}>
              <Icon size={17} /> {label}
            </button>
          ))}
        </aside>

        <main className="settings-center-content">
          {error && <ErrorState message={error} onRetry={load} />}
          {loading && data.companies.length === 0 ? <LoadingState /> : null}
          {activeTab === 'companies' && (
            <section className="settings-company-grid">
              <div className="panel">
                <h2>Firma listesi</h2>
                <DataTable
                  rows={data.companies}
                  emptyTitle="Firma yok"
                  emptyText="Firma kaydi olusturuldugunda paket, lisans ve entegrasyon bilgileri burada gorunur."
                  columns={[
                    { key: 'name', label: 'Firma Adi', render: (row) => <button type="button" className="text-link" onClick={() => setSelectedCompany(row)}>{row.name}</button> },
                    { key: 'plan', label: 'Paket', render: (row) => companyPlan(row, data.subscriptions) },
                    { key: 'marketplaces', label: 'Aktif Marketplace', render: (row) => companyMarketplaceCount(row, data.marketplaces) },
                    { key: 'orders', label: 'Siparis Hacmi', render: (row) => companyOrderCount(row, data.orders) },
                    { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.is_active === false ? 'passive' : 'active'}`}>{row.is_active === false ? 'Pasif' : 'Aktif'}</span> },
                    { key: 'activity', label: 'Son Aktivite', render: (row) => formatDate(latestDate([row, ...data.orders.filter((order) => Number(order.company_id) === Number(row.id))])) },
                  ]}
                />
              </div>
              <CompanyDetailPanel company={selectedCompany} data={data} integrations={selectedCompanyIntegrations} basePath={basePath} />
            </section>
          )}

          {activeTab === 'integrations' && (
            <section className="panel">
              <h2>Entegrasyon hesaplari</h2>
              <DataTable
                rows={integrationAccounts}
                emptyTitle="Entegrasyon hesabi yok"
                emptyText="Pazaryeri, kargo, POS, ERP veya XML kaynagi baglandiginda burada gorunur."
                columns={[
                  { key: 'group', label: 'Tip' },
                  { key: 'provider', label: 'Saglayici' },
                  { key: 'name', label: 'Hesap' },
                  { key: 'company', label: 'Firma' },
                  { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{statusLabel(row.status)}</span> },
                  { key: 'lastTest', label: 'Son Test', render: (row) => row.lastTest ? formatDate(row.lastTest) : 'Endpoint yok' },
                  { key: 'lastSync', label: 'Son Senkron', render: (row) => formatDate(row.lastSync) },
                  { key: 'error', label: 'Hata', render: (row) => row.error || '-' },
                  {
                    key: 'credentials',
                    label: 'Credential',
                    render: (row) => (
                      <CredentialSummary
                        row={row}
                        revealed={Boolean(revealed[row.id])}
                        onToggle={() => setRevealed((current) => ({ ...current, [row.id]: !current[row.id] }))}
                      />
                    ),
                  },
                  { key: 'actions', label: 'Islem', render: (row) => <Link className="button-link secondary-link" to={row.manageTo}>Duzenle</Link> },
                ]}
              />
            </section>
          )}

          {activeTab === 'general' && (
            <section className="settings-card-grid">
              {settingsCards.map(({ title, text, icon: Icon, enabled }) => (
                <article className="settings-option-card" key={title}>
                  <Icon size={22} />
                  <strong>{title}</strong>
                  <span>{text}</span>
                  <button type="button" disabled={!enabled}>{enabled ? 'Duzenle' : 'Endpoint bekleniyor'}</button>
                </article>
              ))}
            </section>
          )}

          {activeTab === 'security' && (
            <section className="settings-security-grid">
              <div className="panel">
                <h2>API Guvenligi</h2>
                <div className="settings-security-list">
                  <SecurityItem title="Credential Maskesi" text="API key, secret, sifre ve token alanlari varsayilan olarak maskelenir." ok />
                  <SecurityItem title="Show/Hide Kontrolu" text="Yetkili kullanici credential alanlarini gecici olarak goruntuleyebilir." ok />
                  <SecurityItem title="Son Baglanti Testi" text="Backend test endpointi olmayan servislerde aksiyon pasif gosterilir." />
                  <SecurityItem title="Webhook Imzasi" text="Webhook secret alanlari ilgili entegrasyon ekranlarinda yonetilir." />
                </div>
              </div>
              <div className="panel">
                <h2>Kritik hesaplar</h2>
                <DataTable
                  rows={integrationAccounts.filter((account) => account.status === 'failed' || !account.lastTest).slice(0, 10)}
                  emptyTitle="Kritik hesap yok"
                  emptyText="Hata veya eksik test bilgisi olan hesaplar burada listelenir."
                  columns={[
                    { key: 'provider', label: 'Saglayici' },
                    { key: 'company', label: 'Firma' },
                    { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{statusLabel(row.status)}</span> },
                    { key: 'lastTest', label: 'Son Test', render: (row) => row.lastTest ? formatDate(row.lastTest) : 'Yok' },
                  ]}
                />
              </div>
            </section>
          )}
        </main>
      </section>
    </div>
  );
}

function SettingsStat({ icon, label, value, tone }) {
  return (
    <div className={`settings-center-stat ${tone}`}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </div>
  );
}

function CompanyDetailPanel({ company, data, integrations, basePath }) {
  if (!company) {
    return (
      <aside className="panel settings-company-detail empty">
        <Building2 size={34} />
        <h2>Firma secin</h2>
        <p>Firma bilgileri, vergi detaylari, entegrasyonlar ve lisans durumu burada gorunur.</p>
      </aside>
    );
  }

  const subscription = data.subscriptions.find((item) => Number(item.company_id) === Number(company.id) && ['trial', 'active'].includes(item.status));
  const license = companyLicense(company, data.licenses);
  const xmlCount = data.xmlSources.filter((source) => Number(source.company_id) === Number(company.id)).length;
  const orderCount = companyOrderCount(company, data.orders);

  return (
    <aside className="panel settings-company-detail">
      <div className="settings-detail-head">
        <div>
          <span className="eyebrow">Firma detayi</span>
          <h2>{company.name}</h2>
        </div>
        <span className={`badge ${company.is_active === false ? 'passive' : 'active'}`}>{company.is_active === false ? 'Pasif' : 'Aktif'}</span>
      </div>
      <div className="settings-detail-grid">
        <DetailItem label="Vergi No" value={company.tax_number || '-'} />
        <DetailItem label="E-posta" value={company.email || '-'} />
        <DetailItem label="Telefon" value={company.phone || '-'} />
        <DetailItem label="Paket" value={subscription?.plan?.name || '-'} />
        <DetailItem label="Marketplace" value={integrations.filter((item) => item.group === 'Pazaryeri').length} />
        <DetailItem label="XML Source" value={xmlCount} />
        <DetailItem label="Siparis" value={orderCount} />
        <DetailItem label="Lisans" value={license?.status ? statusLabel(license.status) : '-'} />
      </div>
      <div className="settings-address-card">
        <strong>Adres</strong>
        <span>{company.address || '-'}</span>
      </div>
      <div className="settings-integration-mini-list">
        <strong>Bagli hesaplar</strong>
        {integrations.length ? integrations.slice(0, 5).map((item) => (
          <div key={item.id}>
            <span>{item.group} / {item.provider}</span>
            <em>{statusLabel(item.status)}</em>
          </div>
        )) : <span>Bagli entegrasyon yok.</span>}
      </div>
      <div className="row-actions">
        <Link className="button-link" to={`${basePath}/companies`}>Firma Sayfasina Git</Link>
        <Link className="button-link secondary-link" to={`${basePath}/marketplaces`}>Entegrasyonlari Yonet</Link>
      </div>
    </aside>
  );
}

function CredentialSummary({ row, revealed, onToggle }) {
  const entries = Object.entries(row.credentials || {}).filter(([, value]) => value);

  if (!entries.length) {
    return <span className="muted-text">Credential yok</span>;
  }

  return (
    <div className="credential-summary">
      <button type="button" className="text-link" onClick={onToggle}>{revealed ? <EyeOff size={14} /> : <Eye size={14} />} {revealed ? 'Gizle' : 'Goster'}</button>
      {entries.slice(0, 3).map(([key, value]) => <small key={key}>{key}: {mask(value, revealed)}</small>)}
    </div>
  );
}

function SecurityItem({ title, text, ok = false }) {
  return (
    <div className={ok ? 'ok' : ''}>
      {ok ? <CheckCircle2 size={18} /> : <LockKeyhole size={18} />}
      <span>
        <strong>{title}</strong>
        <small>{text}</small>
      </span>
    </div>
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
