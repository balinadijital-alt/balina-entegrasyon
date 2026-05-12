import { useEffect, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function SaasPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [licenses, setLicenses] = useState([]);
  const [partners, setPartners] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState('');
  const [usage, setUsage] = useState(null);
  const [licenseKey, setLicenseKey] = useState('');
  const [partnerForm, setPartnerForm] = useState({ name: '', email: '', phone: '', code: '', commission_rate: 0 });

  const load = async () => {
    await run(async () => {
      const [companyResponse, planResponse, subResponse, licenseResponse, partnerResponse] = await Promise.all([
        api.companies.list(), api.saas.plans(), api.saas.subscriptions(), api.saas.licenses(), api.saas.partners(),
      ]);
      setCompanies(companyResponse.data || []);
      setPlans(planResponse || []);
      setSubscriptions(subResponse.data || []);
      setLicenses(licenseResponse.data || []);
      setPartners(partnerResponse.data || []);
      setSelectedCompanyId((companyResponse.data || [])[0]?.id || '');
      setSelectedPlanId((planResponse || [])[0]?.id || '');
    });
  };

  useEffect(() => { load(); }, []);

  const loadUsage = async (companyId = selectedCompanyId) => {
    if (!companyId) return;
    await run(async () => {
      setUsage(await api.saas.usage(companyId));
    }, { onError: (message) => notify('error', message) });
  };

  const changePlan = async () => {
    await run(async () => {
      const response = await api.saas.changePlan(selectedCompanyId, { saas_plan_id: selectedPlanId });
      notify('success', response.message);
      await load();
      await loadUsage(selectedCompanyId);
    }, { onError: (message) => notify('error', message) });
  };

  const startTrial = async () => {
    await run(async () => {
      await api.saas.startTrial(selectedCompanyId, { saas_plan_id: selectedPlanId });
      notify('success', 'Deneme aboneligi baslatildi.');
      await load();
      await loadUsage(selectedCompanyId);
    }, { onError: (message) => notify('error', message) });
  };

  const createLicense = async () => {
    await run(async () => {
      await api.saas.createLicense({ saas_plan_id: selectedPlanId, company_id: selectedCompanyId || null });
      notify('success', 'Lisans anahtari olusturuldu.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const activateLicense = async () => {
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
    await run(async () => {
      await api.saas.createPartner({ ...partnerForm, commission_rate: Number(partnerForm.commission_rate || 0) });
      setPartnerForm({ name: '', email: '', phone: '', code: '', commission_rate: 0 });
      notify('success', 'Partner kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="SaaS Abonelik ve Lisans" />
      <section className="kpi-grid">
        <div className="kpi-card"><span>Paket</span><strong>{plans.length}</strong><small>Satilabilir plan</small></div>
        <div className="kpi-card"><span>Abonelik</span><strong>{subscriptions.length}</strong><small>Firma bazli</small></div>
        <div className="kpi-card"><span>Lisans</span><strong>{licenses.length}</strong><small>Anahtar</small></div>
        <div className="kpi-card"><span>Partner</span><strong>{partners.length}</strong><small>Bayi kanali</small></div>
      </section>
      <section className="panel compact-panel">
        <h2>Abonelik Durumu</h2>
        <div className="form-grid">
          <Field label="Firma"><select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)}><option value="">Seciniz</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Paket"><select value={selectedPlanId} onChange={(e) => setSelectedPlanId(e.target.value)}><option value="">Seciniz</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <button type="button" onClick={() => loadUsage()} disabled={loading}><RefreshCw size={16} /> Kullanim</button>
          <button type="button" onClick={startTrial} disabled={loading}>Deneme Baslat</button>
          <button type="button" onClick={changePlan} disabled={loading}>Plan Degistir</button>
        </div>
        {usage && (
          <div className="stats-grid">
            {Object.entries(usage.usage).map(([metric, item]) => (
              <div className="stat-card" key={metric}>
                <span>{metric}</span>
                <strong>{item.used}/{item.limit === 0 ? '∞' : item.limit}</strong>
                <div className="progress"><span style={{ width: `${item.limit === 0 ? 100 : Math.min(100, (item.used / item.limit) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && subscriptions.length === 0 ? <LoadingState /> : (
      <>
        <section className="panel"><h2>Paketler</h2><DataTable rows={plans} columns={[{ key: 'name', label: 'Paket' }, { key: 'monthly_price', label: 'Aylik' }, { key: 'limits', label: 'Limitler', render: (r) => Object.entries(r.limits || {}).map(([k, v]) => `${k}: ${v === 0 ? '∞' : v}`).join(', ') }]} /></section>
        <section className="panel"><h2>Abonelikler</h2><DataTable rows={subscriptions} columns={[{ key: 'company', label: 'Firma', render: (r) => r.company?.name }, { key: 'plan', label: 'Paket', render: (r) => r.plan?.name }, { key: 'status', label: 'Durum', render: (r) => <span className={`badge ${r.status}`}>{r.status}</span> }, { key: 'starts_at', label: 'Baslangic' }, { key: 'ends_at', label: 'Bitis' }]} /></section>
        <section className="split">
          <div className="panel compact-panel">
            <h2>Lisans Anahtari</h2>
            <button type="button" onClick={createLicense} disabled={loading}><KeyRound size={16} /> Lisans Olustur</button>
            <input value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="Lisans anahtari" />
            <button type="button" onClick={activateLicense} disabled={loading}>Lisans Aktive Et</button>
          </div>
          <form className="panel compact-panel" onSubmit={createPartner}>
            <h2>Bayi / Partner</h2>
            <input value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Partner adi" />
            <input value={partnerForm.email} onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })} placeholder="E-posta" />
            <input value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="Telefon" />
            <input value={partnerForm.code} onChange={(e) => setPartnerForm({ ...partnerForm, code: e.target.value })} placeholder="Kod" />
            <input type="number" value={partnerForm.commission_rate} onChange={(e) => setPartnerForm({ ...partnerForm, commission_rate: e.target.value })} placeholder="Komisyon" />
            <button disabled={loading}>Partner Kaydet</button>
          </form>
        </section>
        <section className="panel"><h2>Lisanslar</h2><DataTable rows={licenses} columns={[{ key: 'key', label: 'Anahtar' }, { key: 'plan', label: 'Paket', render: (r) => r.plan?.name }, { key: 'company', label: 'Firma', render: (r) => r.company?.name || '-' }, { key: 'status', label: 'Durum' }, { key: 'expires_at', label: 'Bitis' }]} /></section>
        <section className="panel"><h2>Partnerler</h2><DataTable rows={partners} columns={[{ key: 'name', label: 'Partner' }, { key: 'code', label: 'Kod' }, { key: 'email', label: 'E-posta' }, { key: 'commission_rate', label: 'Komisyon' }, { key: 'companies_count', label: 'Firma' }]} /></section>
      </>
      )}
    </>
  );
}
