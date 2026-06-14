import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock3,
  Crown,
  Eye,
  KeyRound,
  Rocket,
  ShieldCheck,
  TrendingUp,
  UsersRound,
} from 'lucide-react';
import { api, asArray, asObject } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const metricLabels = {
  products: 'Urun limiti',
  marketplaces: 'Marketplace limiti',
  xml_sources: 'XML source limiti',
  orders: 'Aylik siparis limiti',
  users: 'Kullanici limiti',
};

const planTone = {
  starter: 'blue',
  baslangic: 'blue',
  professional: 'purple',
  profesyonel: 'purple',
  enterprise: 'green',
  kurumsal: 'green',
};

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short' }).format(new Date(value));
}

function daysUntil(value) {
  if (!value) {
    return null;
  }

  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

function planCode(plan) {
  return String(plan?.code || plan?.name || '').toLowerCase();
}

function planLabel(plan) {
  const code = planCode(plan);
  if (code.includes('starter') || code.includes('baslangic')) return 'Baslangic';
  if (code.includes('professional') || code.includes('profesyonel')) return 'Profesyonel';
  if (code.includes('enterprise') || code.includes('kurumsal')) return 'Kurumsal';
  return plan?.name || 'Paket';
}

function usagePercent(item) {
  if (!item || Number(item.limit || 0) === 0) {
    return 0;
  }

  return Math.min(100, Math.round((Number(item.used || 0) / Number(item.limit || 1)) * 100));
}

function subscriptionUsagePercent(subscription, usageMap) {
  const companyUsage = usageMap[subscription.company_id];
  const usage = asObject(companyUsage?.usage, null);
  if (!usage) {
    return 0;
  }

  const values = Object.values(usage);
  if (!values.length) {
    return 0;
  }

  return Math.max(...values.map(usagePercent));
}

function hasLimitWarning(subscription, usageMap) {
  return subscriptionUsagePercent(subscription, usageMap) >= 90;
}

function statusLabel(status) {
  return {
    active: 'Aktif',
    trial: 'Trial',
    changed: 'Degisti',
    cancelled: 'Iptal',
    available: 'Kullanilabilir',
    expired: 'Suresi Doldu',
  }[status] || status || '-';
}

export function SaasPage() {
  const { notify, user } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [usageMap, setUsageMap] = useState({});
  const [selectedSubscription, setSelectedSubscription] = useState(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [partnerForm, setPartnerForm] = useState({ name: '', email: '', phone: '', code: '', commission_rate: 0 });

  const selectedUsage = selectedCompanyId ? usageMap[selectedCompanyId] : null;
  const canManageSaas = hasPermission(user, 'saas.manage');

  const load = async () => {
    await run(async () => {
      const [companyResponse, planResponse, subResponse, licenseResponse, partnerResponse] = await Promise.all([
        api.companies.list(),
        api.saas.plans(),
        api.saas.subscriptions(),
        api.saas.licenses(),
        api.saas.partners(),
      ]);
      const nextCompanies = asArray(companyResponse);
      const nextPlans = asArray(planResponse);
      const nextSubscriptions = asArray(subResponse);

      setCompanies(nextCompanies);
      setPlans(nextPlans);
      setSubscriptions(nextSubscriptions);
      setLicenses(asArray(licenseResponse));
      setPartners(asArray(partnerResponse));
      setSelectedCompanyId((current) => current || nextCompanies[0]?.id || '');
      setSelectedPlanId((current) => current || nextPlans[0]?.id || '');
      setSelectedSubscription((current) => {
        if (!nextSubscriptions.length) return null;
        return nextSubscriptions.find((subscription) => subscription.id === current?.id) || nextSubscriptions[0];
      });

      const usageResults = await Promise.allSettled(
        nextSubscriptions
          .filter((subscription) => subscription.company_id)
          .slice(0, 12)
          .map((subscription) => api.saas.usage(subscription.company_id).then((usage) => [subscription.company_id, usage])),
      );
      const nextUsageMap = {};
      usageResults.forEach((result) => {
        if (result.status === 'fulfilled') {
          const [companyId, usage] = result.value;
          nextUsageMap[companyId] = asObject(usage);
        }
      });
      setUsageMap(nextUsageMap);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const loadUsage = async (companyId = selectedCompanyId) => {
    if (!companyId) return;
    await run(async () => {
      const response = await api.saas.usage(companyId);
      setUsageMap((current) => ({ ...current, [companyId]: asObject(response) }));
    }, { onError: (message) => notify('error', message) });
  };

  const changePlan = async () => {
    if (!canManageSaas) return;
    await run(async () => {
      const response = await api.saas.changePlan(selectedCompanyId, { saas_plan_id: selectedPlanId });
      notify('success', response.message);
      await load();
      await loadUsage(selectedCompanyId);
    }, { onError: (message) => notify('error', message) });
  };

  const startTrial = async () => {
    if (!canManageSaas) return;
    await run(async () => {
      await api.saas.startTrial(selectedCompanyId, { saas_plan_id: selectedPlanId });
      notify('success', 'Deneme aboneligi baslatildi.');
      await load();
      await loadUsage(selectedCompanyId);
    }, { onError: (message) => notify('error', message) });
  };

  const createLicense = async () => {
    if (!canManageSaas) return;
    await run(async () => {
      await api.saas.createLicense({ saas_plan_id: selectedPlanId, company_id: selectedCompanyId || null });
      notify('success', 'Lisans anahtari olusturuldu.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const activateLicense = async () => {
    if (!canManageSaas) return;
    await run(async () => {
      const response = await api.saas.activateLicense({ key: licenseKey, company_id: selectedCompanyId });
      notify('success', response.message);
      setLicenseKey('');
      await load();
      await loadUsage(selectedCompanyId);
    }, { onError: (message) => notify('error', message) });
  };

  const createPartner = async (event) => {
    event.preventDefault();
    if (!canManageSaas) return;
    await run(async () => {
      await api.saas.createPartner({ ...partnerForm, commission_rate: Number(partnerForm.commission_rate || 0) });
      setPartnerForm({ name: '', email: '', phone: '', code: '', commission_rate: 0 });
      notify('success', 'Partner kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const metrics = useMemo(() => ({
    active: subscriptions.filter((subscription) => subscription.status === 'active').length,
    trial: subscriptions.filter((subscription) => subscription.status === 'trial').length,
    expiring: subscriptions.filter((subscription) => {
      const remaining = daysUntil(subscription.ends_at || subscription.trial_ends_at);
      return remaining !== null && remaining >= 0 && remaining <= 7;
    }).length,
    limitRisk: subscriptions.filter((subscription) => hasLimitWarning(subscription, usageMap)).length,
    licenses: licenses.filter((license) => license.status === 'active').length,
    partners: partners.length,
  }), [licenses, partners.length, subscriptions, usageMap]);

  return (
    <div className="saas-page">
      <PageHeader
        title="SaaS Operasyon Merkezi"
        description="Firma abonelikleri, paket limitleri, kullanim metrikleri, lisans anahtarlari ve partner yapisini tek merkezden yonetin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><TrendingUp size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="saas" />

      <section className="saas-hero">
        <div>
          <span className="eyebrow">SaaS gelir ve limit kontrolu</span>
          <h2>Paket, abonelik ve kullanim sagligini tek panelde takip edin.</h2>
          <p>Trial hesaplari, suresi yaklasan paketleri, limit asimi risklerini, lisanslari ve partner kanalini operasyonel olarak yonetin.</p>
          {canManageSaas && (
            <div className="saas-hero-actions">
              <button type="button" onClick={changePlan} disabled={loading || !selectedCompanyId || !selectedPlanId}><Rocket size={16} /> Paket Degistir</button>
              <button type="button" className="secondary" onClick={startTrial} disabled={loading || !selectedCompanyId || !selectedPlanId}><Clock3 size={16} /> Trial Baslat</button>
            </div>
          )}
        </div>
        <div className="saas-hero-status">
          <Crown size={28} />
          <strong>{subscriptions.length}</strong>
          <span>Toplam abonelik</span>
          <small>{metrics.limitRisk} firma limit riski, {metrics.expiring} paket yakinda bitiyor.</small>
        </div>
      </section>

      <section className="saas-stat-grid">
        <MetricCard className="saas-stat-card" icon={<CheckCircle2 size={18} />} label="Aktif abonelikler" value={metrics.active} tone="green" />
        <MetricCard className="saas-stat-card" icon={<Clock3 size={18} />} label="Trial hesaplar" value={metrics.trial} tone="blue" />
        <MetricCard className="saas-stat-card" icon={<AlertTriangle size={18} />} label="Suresi yaklasan" value={metrics.expiring} tone="orange" />
        <MetricCard className="saas-stat-card" icon={<BarChart3 size={18} />} label="Limit asimi riski" value={metrics.limitRisk} tone="red" />
        <MetricCard className="saas-stat-card" icon={<KeyRound size={18} />} label="Aktif lisanslar" value={metrics.licenses} tone="purple" />
        <MetricCard className="saas-stat-card" icon={<UsersRound size={18} />} label="Partner / bayi" value={metrics.partners} tone="green" />
      </section>

      <section className="saas-plan-grid">
        {plans.map((plan) => (
          <article className={`saas-plan-card ${planTone[planCode(plan)] || ''}`} key={plan.id}>
            <div>
              <span>{planLabel(plan)}</span>
              <strong>{formatMoney(plan.monthly_price)} / ay</strong>
              <p>{asArray(plan.features).slice(0, 3).join(' / ') || 'Entegrasyon ve operasyon limitleri'}</p>
            </div>
            <div className="saas-plan-limits">
              {Object.entries(asObject(plan.limits)).slice(0, 5).map(([metric, limit]) => (
                <div key={metric}>
                  <small>{metricLabels[metric] || metric}</small>
                  <b>{Number(limit) === 0 ? 'Limitsiz' : limit}</b>
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>

      <section className="panel saas-control-panel">
        <div>
          <h2>Abonelik aksiyonlari</h2>
          <p>Firma ve paket secerek plan degistirme, trial baslatma, lisans olusturma ve kullanimi inceleme islemlerini yapin.</p>
        </div>
        <div className="saas-control-grid">
          <Field label="Firma">
            <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Paket">
            <select value={selectedPlanId} onChange={(event) => setSelectedPlanId(event.target.value)}>
              <option value="">Seciniz</option>
              {plans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select>
          </Field>
          <button type="button" onClick={() => loadUsage()} disabled={loading || !selectedCompanyId}><Eye size={16} /> Kullanim Detayi</button>
          {canManageSaas && <button type="button" onClick={createLicense} disabled={loading || !selectedPlanId}><KeyRound size={16} /> Lisans Olustur</button>}
        </div>
      </section>

      {selectedUsage && (
        <section className="saas-usage-grid">
          {Object.entries(asObject(selectedUsage.usage)).map(([metric, item]) => (
            <div className={usagePercent(item) >= 90 ? 'saas-usage-card warning' : 'saas-usage-card'} key={metric}>
              <span>{metricLabels[metric] || metric}</span>
              <strong>{item.used}/{Number(item.limit) === 0 ? 'Limitsiz' : item.limit}</strong>
              <div className="progress"><span style={{ width: `${Number(item.limit) === 0 ? 100 : usagePercent(item)}%` }} /></div>
              <small>{Number(item.limit) === 0 ? 'Limitsiz kullanim' : `${item.remaining} hak kaldi`}</small>
            </div>
          ))}
        </section>
      )}

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && subscriptions.length === 0 ? <LoadingState /> : (
        <>
          <section className="saas-layout">
            <div className="panel">
              <h2>Firma abonelikleri</h2>
              <DataTable
                rows={subscriptions}
                emptyTitle="Abonelik yok"
                emptyText="Firma icin trial baslattiginizda veya paket atadiginizda abonelikler burada gorunur."
                columns={[
                  { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
                  { key: 'plan', label: 'Paket', render: (row) => planLabel(row.plan) },
                  { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={row.status} label={statusLabel(row.status)} /> },
                  { key: 'starts_at', label: 'Baslangic', render: (row) => formatDate(row.starts_at) },
                  { key: 'ends_at', label: 'Bitis', render: (row) => formatDate(row.ends_at || row.trial_ends_at) },
                  { key: 'trial', label: 'Trial', render: (row) => row.status === 'trial' ? 'Aktif' : '-' },
                  {
                    key: 'usage',
                    label: 'Kullanim',
                    render: (row) => (
                      <div className="saas-inline-usage">
                        <span>{subscriptionUsagePercent(row, usageMap)}%</span>
                        <div className="progress"><span style={{ width: `${subscriptionUsagePercent(row, usageMap)}%` }} /></div>
                      </div>
                    ),
                  },
                  { key: 'actions', label: 'Islem', render: (row) => <button type="button" className="secondary" onClick={() => { setSelectedSubscription(row); setSelectedCompanyId(row.company_id); loadUsage(row.company_id); }}><Eye size={15} /> Detay</button> },
                ]}
              />
            </div>

            <SubscriptionDetailPanel subscription={selectedSubscription} usage={selectedSubscription ? usageMap[selectedSubscription.company_id] : null} licenses={licenses} partners={partners} />
          </section>

          <section className="saas-lower-grid">
            <div className="panel">
              <h2>Lisanslar</h2>
              <DataTable
                rows={licenses}
                emptyTitle="Lisans yok"
                emptyText="Lisans olustur aksiyonu ile firmaya veya stok lisansa anahtar uretebilirsiniz."
                columns={[
                  { key: 'key', label: 'Anahtar' },
                  { key: 'plan', label: 'Paket', render: (row) => row.plan?.name || '-' },
                  { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
                  { key: 'status', label: 'Durum', render: (row) => <StatusBadge tone={row.status} label={statusLabel(row.status)} /> },
                  { key: 'expires_at', label: 'Bitis', render: (row) => formatDate(row.expires_at) },
                ]}
              />
            </div>

            <div className="panel">
              <h2>Partnerler</h2>
              <DataTable
                rows={partners}
                emptyTitle="Partner yok"
                emptyText="Bayi veya partner kanali eklediginde burada firma sayisi ve komisyon bilgisi gorunur."
                columns={[
                  { key: 'name', label: 'Partner' },
                  { key: 'code', label: 'Kod' },
                  { key: 'email', label: 'E-posta', render: (row) => row.email || '-' },
                  { key: 'commission_rate', label: 'Komisyon', render: (row) => `%${row.commission_rate || 0}` },
                  { key: 'companies_count', label: 'Firma' },
                ]}
              />
            </div>
          </section>

          {canManageSaas && <section className="saas-form-grid">
            <div className="panel saas-action-panel">
              <h2>Lisans aktive et</h2>
              <p>Hazir lisans anahtarini secili firmaya baglayip aboneligi otomatik guncelleyin.</p>
              <input value={licenseKey} onChange={(event) => setLicenseKey(event.target.value)} placeholder="Lisans anahtari" />
              <button type="button" onClick={activateLicense} disabled={loading || !licenseKey || !selectedCompanyId}>Lisans Aktive Et</button>
            </div>

            <form className="panel saas-action-panel" onSubmit={createPartner}>
              <h2>Bayi / partner ekle</h2>
              <p>Partner kanalini ve komisyon oranini tanimlayin.</p>
              <input value={partnerForm.name} onChange={(event) => setPartnerForm({ ...partnerForm, name: event.target.value })} placeholder="Partner adi" />
              <input value={partnerForm.email} onChange={(event) => setPartnerForm({ ...partnerForm, email: event.target.value })} placeholder="E-posta" />
              <input value={partnerForm.phone} onChange={(event) => setPartnerForm({ ...partnerForm, phone: event.target.value })} placeholder="Telefon" />
              <input value={partnerForm.code} onChange={(event) => setPartnerForm({ ...partnerForm, code: event.target.value })} placeholder="Kod" />
              <input type="number" value={partnerForm.commission_rate} onChange={(event) => setPartnerForm({ ...partnerForm, commission_rate: event.target.value })} placeholder="Komisyon" />
              <button disabled={loading}>Partner Kaydet</button>
            </form>
          </section>}
        </>
      )}
    </div>
  );
}

function SubscriptionDetailPanel({ subscription, usage, licenses, partners }) {
  if (!subscription) {
    return (
      <aside className="panel saas-detail-panel empty">
        <Building2 size={34} />
        <h2>Abonelik detayi secin</h2>
        <p>Bir firma aboneligine tikladiginizda kullanim, limit, lisans ve partner bilgileri burada gorunur.</p>
      </aside>
    );
  }

  const relatedLicense = licenses.find((license) => Number(license.company_id) === Number(subscription.company_id));
  const usageEntries = Object.entries(asObject(usage?.usage));

  return (
    <aside className="panel saas-detail-panel">
      <div className="saas-detail-head">
        <div>
          <span className="eyebrow">Abonelik detayi</span>
          <h2>{subscription.company?.name || 'Firma'}</h2>
        </div>
        <StatusBadge tone={subscription.status} label={statusLabel(subscription.status)} />
      </div>

      <div className="saas-detail-grid">
        <DetailItem label="Paket" value={planLabel(subscription.plan)} />
        <DetailItem label="Baslangic" value={formatDate(subscription.starts_at)} />
        <DetailItem label="Bitis" value={formatDate(subscription.ends_at || subscription.trial_ends_at)} />
        <DetailItem label="Trial" value={subscription.status === 'trial' ? 'Aktif' : 'Yok'} />
        <DetailItem label="Lisans" value={relatedLicense?.key || 'Yok'} />
        <DetailItem label="Partner" value={partners[0]?.name || 'Atanmadi'} />
      </div>

      <div className={hasLimitWarning(subscription, { [subscription.company_id]: usage }) ? 'saas-warning-card' : 'saas-success-card'}>
        {hasLimitWarning(subscription, { [subscription.company_id]: usage }) ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
        <div>
          <strong>{hasLimitWarning(subscription, { [subscription.company_id]: usage }) ? 'Limit uyarisi var' : 'Limitler saglikli'}</strong>
          <p>{hasLimitWarning(subscription, { [subscription.company_id]: usage }) ? 'En az bir kullanim metrigi %90 veya uzerinde.' : 'Kritik limit asimi gorunmuyor.'}</p>
        </div>
      </div>

      <div className="saas-detail-usage">
        {usageEntries.length ? usageEntries.map(([metric, item]) => (
          <div key={metric}>
            <span>{metricLabels[metric] || metric}</span>
            <strong>{item.used}/{Number(item.limit) === 0 ? 'Limitsiz' : item.limit}</strong>
            <div className="progress"><span style={{ width: `${Number(item.limit) === 0 ? 100 : usagePercent(item)}%` }} /></div>
          </div>
        )) : <SoftEmpty>Kullanim detayi henuz yuklenmedi.</SoftEmpty>}
      </div>
    </aside>
  );
}
