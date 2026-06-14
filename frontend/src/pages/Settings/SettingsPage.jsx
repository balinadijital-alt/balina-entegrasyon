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
  Save,
  Settings2,
  ShieldCheck,
  Store,
  Webhook,
} from 'lucide-react';
import { api, apiErrorMessage, asArray, asObject } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  { key: 'companies', label: 'Firmalar', icon: Building2 },
  { key: 'integrations', label: 'Entegrasyon Hesaplari', icon: Link2 },
  { key: 'general', label: 'Genel Ayarlar', icon: Settings2 },
  { key: 'security', label: 'Guvenlik', icon: ShieldCheck },
];

const defaultSettings = {
  notifications: {},
  email: {},
  webhooks: {},
  localization: {},
  theme: {},
  security: {},
};

function normalizeSettings(response) {
  const settings = asObject(response, {});

  return Object.fromEntries(
    Object.entries(defaultSettings).map(([key, fallback]) => [key, asObject(settings[key], fallback)]),
  );
}

function valueFrom(result, fallback) {
  return result.status === 'fulfilled' ? result.value : fallback;
}

function rowsFrom(response) {
  return asArray(response);
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

function deliveryTone(status, success) {
  if (success || status === 'delivered') return 'success';
  if (status === 'failed') return 'failed';
  return 'warning';
}

function jsonPreview(value) {
  if (!value) return '{}';
  return JSON.stringify(value, null, 2);
}

export function SettingsPage({ audience = 'admin' }) {
  const { user } = useApp();
  const { loading, error, run } = useAsync();
  const [activeTab, setActiveTab] = useState('companies');
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [revealed, setRevealed] = useState({});
  const [settingsRevealed, setSettingsRevealed] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [webhookTestMessage, setWebhookTestMessage] = useState('');
  const [webhookTestError, setWebhookTestError] = useState('');
  const [settings, setSettings] = useState(defaultSettings);
  const [webhookDeliveries, setWebhookDeliveries] = useState([]);
  const [selectedDelivery, setSelectedDelivery] = useState(null);
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
  const canManageSettings = hasPermission(user, 'settings.manage');

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
        persistedSettings,
        deliveries,
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
        api.settings.show(),
        api.settings.webhookDeliveries({ limit: 30 }),
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
      setSettings(normalizeSettings(valueFrom(persistedSettings, {})));
      const nextDeliveries = asArray(valueFrom(deliveries, {}));
      setWebhookDeliveries(nextDeliveries);
      setSelectedDelivery((current) => current || nextDeliveries[0] || null);
      setSelectedCompany((current) => current || nextData.companies[0] || null);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const updateSetting = (section, key, value) => {
    setSettings((current) => ({
      ...current,
      [section]: {
        ...asObject(current[section], {}),
        [key]: value,
      },
    }));
    setSettingsMessage('');
    setSettingsError('');
    setWebhookTestMessage('');
    setWebhookTestError('');
  };

  const saveSettings = async (event) => {
    event.preventDefault();
    if (!canManageSettings) return;
    setSettingsSaving(true);
    setSettingsMessage('');
    setSettingsError('');

    try {
      const saved = await api.settings.update(settings);
      setSettings(normalizeSettings(saved));
      setSettingsMessage('Ayarlar kaydedildi.');
    } catch (requestError) {
      setSettingsError(apiErrorMessage(requestError));
    } finally {
      setSettingsSaving(false);
    }
  };

  const testWebhook = async () => {
    if (!canManageSettings) return;
    setWebhookTestMessage('');
    setWebhookTestError('');

    if (!settings.webhooks.enabled) {
      setWebhookTestError('Webhook aktif degil.');
      return;
    }

    if (!settings.webhooks.endpoint_url) {
      setWebhookTestError('Webhook hedef URL bos.');
      return;
    }

    setWebhookTesting(true);

    try {
      const response = await api.settings.testWebhook();
      setWebhookTestMessage(response.message || 'Webhook test istegi basarili.');
      const deliveries = await api.settings.webhookDeliveries({ limit: 30 });
      const nextDeliveries = asArray(deliveries);
      setWebhookDeliveries(nextDeliveries);
      setSelectedDelivery(nextDeliveries[0] || null);
    } catch (requestError) {
      setWebhookTestError(apiErrorMessage(requestError));
    } finally {
      setWebhookTesting(false);
    }
  };

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

  const metrics = {
    companies: data.companies.length,
    integrations: integrationAccounts.length,
    warnings: integrationAccounts.filter((account) => account.status === 'failed').length,
    licenses: data.licenses.filter((license) => license.status === 'active').length,
  };

  return (
    <div className="settings-center-page">
      <PageHeader
        title="Ayarlar"
        description="Firma, entegrasyon, bildirim ve guvenlik ayarlarini tek ekrandan kontrol edin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav
        section={audience === 'admin' ? 'admin' : 'operations'}
        note="Ayarlar sayfasi firma bilgileri, entegrasyon hesaplari, genel tercihler ve guvenlik kontrolleri icin ana yonetim alanidir."
        next="Siradaki islem: once ilgili sekmeyi secin, sonra tablo veya form uzerinden gerekli bilgiyi guncelleyin."
      />

      <section className="settings-reference-tabs" aria-label="Ayar bolumleri">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button type="button" className={activeTab === key ? 'active' : ''} key={key} onClick={() => setActiveTab(key)}>
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </section>

      <section className="settings-reference-summary">
        <div>
          <span>Firma</span>
          <strong>{metrics.companies}</strong>
          <small>Kayitli musteri</small>
        </div>
        <div>
          <span>Entegrasyon</span>
          <strong>{metrics.integrations}</strong>
          <small>Bagli hesap</small>
        </div>
        <div>
          <span>Kritik Uyari</span>
          <strong>{metrics.warnings}</strong>
          <small>Kontrol gerekli</small>
        </div>
        <div>
          <span>Aktif Lisans</span>
          <strong>{metrics.licenses}</strong>
          <small>Kullanımda</small>
        </div>
      </section>

      <section className="settings-center-layout">
        <aside className="settings-action-panel">
          <div className="settings-action-panel-title">
            <strong>Yonetim Adimlari</strong>
            <span>Sayfa amacini secin ve ilgili tabloyu duzenleyin.</span>
          </div>
          <div className="settings-action-list">
            <button type="button" className={activeTab === 'companies' ? 'active' : ''} onClick={() => setActiveTab('companies')}>
              <Building2 size={17} />
              <span><strong>Firma bilgileri</strong><small>Paket, lisans, siparis ve adres ozeti.</small></span>
            </button>
            <button type="button" className={activeTab === 'integrations' ? 'active' : ''} onClick={() => setActiveTab('integrations')}>
              <Link2 size={17} />
              <span><strong>Entegrasyon hesaplari</strong><small>Pazaryeri, kargo, POS, ERP ve XML baglantilari.</small></span>
            </button>
            <button type="button" className={activeTab === 'general' ? 'active' : ''} onClick={() => setActiveTab('general')}>
              <Settings2 size={17} />
              <span><strong>Genel ayarlar</strong><small>Bildirim, e-posta, webhook, dil ve tema.</small></span>
            </button>
            <button type="button" className={activeTab === 'security' ? 'active' : ''} onClick={() => setActiveTab('security')}>
              <ShieldCheck size={17} />
              <span><strong>Guvenlik</strong><small>Credential maskeleme ve kritik hesap kontrolleri.</small></span>
            </button>
          </div>
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
                    { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={row.is_active === false ? 'passive' : 'active'} label={row.is_active === false ? 'Pasif' : 'Aktif'} /> },
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
                  { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={row.status} label={statusLabel(row.status)} /> },
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
                  { key: 'actions', label: 'Islem', render: (row) => canManageSettings ? <Link className="button-link secondary-link" to={row.manageTo}>Duzenle</Link> : '-' },
                ]}
              />
            </section>
          )}

          {activeTab === 'general' && (
            <>
            <form className="settings-card-grid" onSubmit={saveSettings}>
              <article className="settings-option-card">
                <Bell size={22} />
                <strong>Bildirim Ayarlari</strong>
                <span>E-posta, panel ve operasyon uyarilari icin merkezi bildirim kurallari.</span>
                <label className="field">
                  <span>E-posta bildirimi</span>
                  <input type="checkbox" checked={Boolean(settings.notifications.email_enabled)} onChange={(event) => updateSetting('notifications', 'email_enabled', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Panel bildirimi</span>
                  <input type="checkbox" checked={Boolean(settings.notifications.panel_enabled)} onChange={(event) => updateSetting('notifications', 'panel_enabled', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Sadece kritik uyari</span>
                  <input type="checkbox" checked={Boolean(settings.notifications.critical_only)} onChange={(event) => updateSetting('notifications', 'critical_only', event.target.checked)} />
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <Mail size={22} />
                <strong>E-posta Ayarlari</strong>
                <span>SMTP, gonderici adresi ve sablon baglantilari.</span>
                <label className="field">
                  <span>Gonderici adi</span>
                  <input value={settings.email.from_name || ''} onChange={(event) => updateSetting('email', 'from_name', event.target.value)} />
                </label>
                <label className="field">
                  <span>Gonderici e-posta</span>
                  <input type="email" value={settings.email.from_email || ''} onChange={(event) => updateSetting('email', 'from_email', event.target.value)} />
                </label>
                <label className="field">
                  <span>SMTP host</span>
                  <input value={settings.email.smtp_host || ''} onChange={(event) => updateSetting('email', 'smtp_host', event.target.value)} />
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <Webhook size={22} />
                <strong>Webhook Ayarlari</strong>
                <span>Siparis, urun, fatura ve kargo olaylari icin webhook hedefleri.</span>
                <label className="field">
                  <span>Webhook aktif</span>
                  <input type="checkbox" checked={Boolean(settings.webhooks.enabled)} onChange={(event) => updateSetting('webhooks', 'enabled', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Hedef URL</span>
                  <input value={settings.webhooks.endpoint_url || ''} onChange={(event) => updateSetting('webhooks', 'endpoint_url', event.target.value)} />
                </label>
                <label className="field">
                  <span>Secret</span>
                  <input type={settingsRevealed ? 'text' : 'password'} value={settings.webhooks.secret || ''} onChange={(event) => updateSetting('webhooks', 'secret', event.target.value)} />
                </label>
                <button type="button" className="text-link" onClick={() => setSettingsRevealed((current) => !current)}>{settingsRevealed ? <EyeOff size={14} /> : <Eye size={14} />} {settingsRevealed ? 'Gizle' : 'Goster'}</button>
                {(webhookTestMessage || webhookTestError) && <small>{webhookTestMessage || webhookTestError}</small>}
                {canManageSettings && <button type="button" className="secondary" onClick={testWebhook} disabled={settingsSaving || webhookTesting}>{webhookTesting ? 'Test ediliyor...' : 'Webhook test et'}</button>}
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <Globe2 size={22} />
                <strong>Dil / Lokasyon</strong>
                <span>Dil, tarih formati, saat dilimi ve bolgesel ayarlar.</span>
                <label className="field">
                  <span>Dil</span>
                  <select value={settings.localization.locale || 'tr-TR'} onChange={(event) => updateSetting('localization', 'locale', event.target.value)}>
                    <option value="tr-TR">Turkce</option>
                    <option value="en-US">English</option>
                  </select>
                </label>
                <label className="field">
                  <span>Saat dilimi</span>
                  <input value={settings.localization.timezone || 'Europe/Istanbul'} onChange={(event) => updateSetting('localization', 'timezone', event.target.value)} />
                </label>
                <label className="field">
                  <span>Tarih formati</span>
                  <select value={settings.localization.date_format || 'dd.MM.yyyy'} onChange={(event) => updateSetting('localization', 'date_format', event.target.value)}>
                    <option value="dd.MM.yyyy">dd.MM.yyyy</option>
                    <option value="yyyy-MM-dd">yyyy-MM-dd</option>
                  </select>
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <Store size={22} />
                <strong>Doviz</strong>
                <span>Para birimi ve kur guncelleme tercihleri.</span>
                <label className="field">
                  <span>Para birimi</span>
                  <select value={settings.localization.currency || 'TRY'} onChange={(event) => updateSetting('localization', 'currency', event.target.value)}>
                    <option value="TRY">TRY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </label>
                <label className="field">
                  <span>Kur guncelleme</span>
                  <input type="checkbox" checked={Boolean(settings.localization.currency_auto_update)} onChange={(event) => updateSetting('localization', 'currency_auto_update', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Kur saglayici</span>
                  <input value={settings.localization.currency_provider || ''} onChange={(event) => updateSetting('localization', 'currency_provider', event.target.value)} />
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <Settings2 size={22} />
                <strong>Tema / Arayuz</strong>
                <span>Panel gorunumu, tablo yogunlugu ve tema tercihleri.</span>
                <label className="field">
                  <span>Tema</span>
                  <select value={settings.theme.mode || 'system'} onChange={(event) => updateSetting('theme', 'mode', event.target.value)}>
                    <option value="system">Sistem</option>
                    <option value="light">Acik</option>
                    <option value="dark">Koyu</option>
                  </select>
                </label>
                <label className="field">
                  <span>Tablo yogunlugu</span>
                  <select value={settings.theme.density || 'comfortable'} onChange={(event) => updateSetting('theme', 'density', event.target.value)}>
                    <option value="comfortable">Rahat</option>
                    <option value="compact">Kompakt</option>
                  </select>
                </label>
                <label className="field">
                  <span>Animasyonlari azalt</span>
                  <input type="checkbox" checked={Boolean(settings.theme.reduce_motion)} onChange={(event) => updateSetting('theme', 'reduce_motion', event.target.checked)} />
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              <article className="settings-option-card">
                <ShieldCheck size={22} />
                <strong>Guvenlik tercihleri</strong>
                <span>Credential gorunurlugu ve panel guvenlik tercihleri kaydedilir.</span>
                <label className="field">
                  <span>Credential maskesi</span>
                  <input type="checkbox" checked={settings.security.mask_credentials !== false} onChange={(event) => updateSetting('security', 'mask_credentials', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Gosterim onayi</span>
                  <input type="checkbox" checked={Boolean(settings.security.reveal_confirmation)} onChange={(event) => updateSetting('security', 'reveal_confirmation', event.target.checked)} />
                </label>
                <label className="field">
                  <span>Oturum uyarisi dk</span>
                  <input type="number" min="1" value={settings.security.session_warning_minutes || ''} onChange={(event) => updateSetting('security', 'session_warning_minutes', event.target.value)} />
                </label>
                {canManageSettings && <button type="submit" disabled={settingsSaving}><Save size={16} /> {settingsSaving ? 'Kaydediliyor...' : 'Kaydet'}</button>}
              </article>

              {(settingsMessage || settingsError) && (
                <article className="settings-option-card">
                  {settingsMessage ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
                  <strong>{settingsMessage ? 'Kayit tamamlandi' : 'Ayar kaydedilemedi'}</strong>
                  <span>{settingsMessage || settingsError}</span>
                  <button type="button" onClick={load} disabled={loading}>Yenile</button>
                </article>
              )}
            </form>

            <section className="settings-security-grid">
              <div className="panel">
                <div className="section-title-row">
                  <h2>Webhook Delivery Gecmisi</h2>
                  <button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={15} /> Yenile</button>
                </div>
                <DataTable
                  rows={webhookDeliveries}
                  emptyTitle="Delivery kaydi yok"
                  emptyText="Webhook testleri veya runtime eventleri gonderildiginde delivery kayitlari burada gorunur."
                  columns={[
                    { key: 'event', label: 'Event' },
                    { key: 'endpoint', label: 'Endpoint', render: (row) => <span className="muted-text">{row.endpoint}</span> },
                    { key: 'status', label: 'Status', render: (row) => <StatusPill tone={deliveryTone(row.status, row.success)} label={row.status || 'queued'} /> },
                    { key: 'attempts', label: 'Retry', render: (row) => row.attempts || 0 },
                    { key: 'response_code', label: 'HTTP', render: (row) => row.response_code || '-' },
                    { key: 'last_error', label: 'Son hata', render: (row) => row.last_error || '-' },
                    { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.created_at) },
                    { key: 'actions', label: 'Detay', render: (row) => <button type="button" className="secondary-button" onClick={() => setSelectedDelivery(row)}><Eye size={15} /> Detay</button> },
                  ]}
                />
              </div>

              <aside className="panel log-detail-panel">
                <div className="section-title-row">
                  <h2>Delivery Detayi</h2>
                  {selectedDelivery && <StatusPill tone={deliveryTone(selectedDelivery.status, selectedDelivery.success)} label={selectedDelivery.status} />}
                </div>
                {!selectedDelivery ? (
                  <SoftEmpty>Detay icin bir delivery kaydi secin.</SoftEmpty>
                ) : (
                  <>
                    <div className="settings-detail-grid">
                      <DetailItem label="Delivery ID" value={selectedDelivery.delivery_id || '-'} />
                      <DetailItem label="Event" value={selectedDelivery.event || '-'} />
                      <DetailItem label="Attempts" value={selectedDelivery.attempts || 0} />
                      <DetailItem label="HTTP" value={selectedDelivery.response_code || '-'} />
                      <DetailItem label="Delivered" value={formatDate(selectedDelivery.delivered_at)} />
                      <DetailItem label="Failed" value={formatDate(selectedDelivery.failed_at)} />
                    </div>
                    {selectedDelivery.last_error && <SoftEmpty className="workflow-warning"><strong>Son hata</strong><span>{selectedDelivery.last_error}</span></SoftEmpty>}
                    <SoftEmpty><strong>Endpoint</strong><span>{selectedDelivery.endpoint || '-'}</span></SoftEmpty>
                    <details className="json-collapse">
                      <summary>Maskelenmis payload JSON</summary>
                      <pre>{jsonPreview(selectedDelivery.payload)}</pre>
                    </details>
                    <details className="json-collapse">
                      <summary>Response body</summary>
                      <pre>{jsonPreview(selectedDelivery.response_body)}</pre>
                    </details>
                  </>
                )}
              </aside>
            </section>
            </>
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
                    { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={row.status} label={statusLabel(row.status)} /> },
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
        <StatusBadge tone={company.is_active === false ? 'passive' : 'active'} label={company.is_active === false ? 'Pasif' : 'Aktif'} />
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
  const entries = Object.entries(asObject(row.credentials)).filter(([, value]) => value);

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
