import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CheckCircle2, ExternalLink, PackagePlus, RefreshCw, Rocket, ShoppingBag, Store, Truck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { ConnectionStatusCard } from '../../components/ConnectionStatusCard.jsx';
import { CredentialInput } from '../../components/CredentialInput.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { MarketplaceOptionCard } from '../../components/MarketplaceOptionCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { WizardStepper } from '../../components/WizardStepper.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const steps = [
  'Pazaryeri',
  'Magaza Bilgileri',
  'API Bilgileri',
  'Baglanti Testi',
  'Ilk Senkron',
  'Tamamlandi',
];

const marketplaceOptions = [
  { code: 'trendyol', name: 'Trendyol', status: 'Aktif', icon: Store, description: 'Supplier ID, API Key ve API Secret ile baglanir.' },
  { code: 'hepsiburada', name: 'Hepsiburada', status: 'Aktif', icon: ShoppingBag, description: 'Merchant ID, kullanici adi ve parola ile baglanir.' },
  { code: 'n11', name: 'N11', status: 'Yakinda', icon: ShoppingBag, description: 'Kurulum akisi hazirlaniyor.', disabled: true },
  { code: 'amazon', name: 'Amazon', status: 'Yakinda', icon: ShoppingBag, description: 'Kurulum akisi hazirlaniyor.', disabled: true },
  { code: 'ciceksepeti', name: 'CicekSepeti', status: 'Yakinda', icon: ShoppingBag, description: 'Kurulum akisi hazirlaniyor.', disabled: true },
  { code: 'pazarama', name: 'Pazarama', status: 'Yakinda', icon: ShoppingBag, description: 'Kurulum akisi hazirlaniyor.', disabled: true },
];

const initialForm = {
  company_id: '',
  code: 'trendyol',
  name: '',
  supplier_id: '',
  merchant_id: '',
  api_key: '',
  api_secret: '',
  service_username: '',
  service_password: '',
  environment: 'production',
};

function friendlyMarketplaceError(message) {
  if (String(message || '').includes('401')) return 'Baglanti bilgileri hatali olabilir. API anahtari, gizli anahtar ve ortam bilgisini kontrol edin.';
  if (String(message || '').includes('403')) return 'Pazaryeri hesabi bu islem icin yetkili gorunmuyor.';
  if (String(message || '').includes('429')) return 'Pazaryeri istek limiti doldu. Biraz bekleyip tekrar deneyin.';
  if (String(message || '').toLowerCase().includes('network')) return 'Pazaryerine ulasilamadi. Internet baglantisini veya servis durumunu kontrol edin.';
  return message || 'Baglanti testi basarisiz oldu.';
}

function validateStep(step, form) {
  const errors = {};
  if (step >= 1) {
    if (!form.company_id) errors.company_id = 'Firma secimi zorunludur.';
    if (!form.name) errors.name = 'Magaza adi zorunludur.';
    if (form.code === 'trendyol' && !form.supplier_id) errors.supplier_id = 'Trendyol icin Supplier ID zorunludur.';
    if (form.code === 'hepsiburada' && !form.merchant_id) errors.merchant_id = 'Hepsiburada icin Merchant ID zorunludur.';
  }
  if (step >= 2) {
    if (!form.api_key && !form.service_username) errors.api_key = 'API Key veya kullanici adi zorunludur.';
    if (!form.api_secret && !form.service_password) errors.api_secret = 'API Secret veya parola zorunludur.';
  }
  return errors;
}

export function MarketplaceOnboardingPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [savedAccount, setSavedAccount] = useState(null);
  const [testStatus, setTestStatus] = useState({ status: 'idle', title: 'Baglanti testi bekliyor', message: 'Bilgileri kaydettikten sonra pazaryeri baglantisini kontrol edin.' });

  const selectedMarketplace = useMemo(() => marketplaceOptions.find((item) => item.code === form.code), [form.code]);

  const load = async () => {
    await run(async () => {
      const [companyResponse, accountResponse] = await Promise.all([api.companies.list(), api.marketplaces.list()]);
      setCompanies(companyResponse.data || []);
      setAccounts(accountResponse.data || []);
      setForm((current) => ({ ...current, company_id: current.company_id || companyResponse.data?.[0]?.id || '' }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const goNext = () => {
    const validationErrors = validateStep(step, form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError(Object.values(validationErrors)[0]);
      return;
    }
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const saveAccount = async () => {
    const validationErrors = validateStep(2, form);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) {
      setError(Object.values(validationErrors)[0]);
      return null;
    }

    return run(async () => {
      const payload = {
        company_id: form.company_id,
        code: form.code,
        name: form.name,
        supplier_id: form.supplier_id || null,
        merchant_id: form.merchant_id || null,
        api_key: form.api_key || form.service_username,
        api_secret: form.api_secret || form.service_password,
        service_username: form.service_username || form.api_key,
        service_password: form.service_password || form.api_secret,
        is_active: true,
        metadata: {
          environment: form.environment,
          source: 'onboarding-wizard',
        },
      };
      const existing = accounts.find((account) => account.code === form.code && String(account.company_id) === String(form.company_id));
      const account = existing ? await api.marketplaces.update(existing.id, payload) : await api.marketplaces.create(payload);
      setSavedAccount(account);
      notify('success', 'Pazaryeri hesabi kaydedildi.');
      await load();
      return account;
    }, { onError: (message) => notify('error', friendlyMarketplaceError(message)) });
  };

  const testConnection = async () => {
    setTestStatus({ status: 'idle', title: 'Baglanti testi calisiyor', message: 'Pazaryeri servisinden yanit bekleniyor.' });
    const account = savedAccount || await saveAccount();
    if (!account?.id) return;

    await run(async () => {
      const response = form.code === 'hepsiburada'
        ? await api.marketplaces.hepsiburadaTest(account.id)
        : await api.marketplaces.trendyolTest(account.id);
      setTestStatus({
        status: 'success',
        title: 'Baglanti basarili',
        message: response.message || `${selectedMarketplace.name} hesabi dogrulandi. Ilk senkron adimlarina gecebilirsiniz.`,
      });
      notify('success', 'Baglanti testi basarili.');
      setStep(4);
    }, {
      onError: (message) => {
        const friendly = friendlyMarketplaceError(message);
        setTestStatus({ status: 'error', title: 'Baglanti basarisiz', message: friendly });
        notify('error', friendly);
      },
    });
  };

  const executeSuggestion = async (type) => {
    const account = savedAccount || await saveAccount();
    if (!account?.id) return;
    const actions = {
      categories: () => form.code === 'hepsiburada' ? api.marketplaces.hepsiburadaCategories(account.id) : api.marketplaces.trendyolCategories(account.id),
      products: () => form.code === 'hepsiburada' ? api.marketplaces.hepsiburadaSendProducts(account.id) : api.marketplaces.trendyolSendProducts(account.id),
      prices: () => form.code === 'hepsiburada' ? api.marketplaces.hepsiburadaUpdatePriceInventory(account.id) : api.marketplaces.trendyolUpdatePriceInventory(account.id),
      orders: () => form.code === 'hepsiburada' ? api.marketplaces.hepsiburadaPullOrders(account.id) : api.marketplaces.trendyolPullOrders(account.id),
    };
    await run(async () => {
      const response = await actions[type]();
      notify('success', response.message || 'Islem baslatildi.');
    }, { onError: (message) => notify('error', friendlyMarketplaceError(message)) });
  };

  return (
    <>
      <PageHeader
        title="Pazaryeri Kurulum Sihirbazi"
        description="Trendyol ve Hepsiburada hesaplarinizi adim adim baglayin, bilgileri dogrulayin ve ilk senkronizasyon aksiyonlarini baslatin."
      />

      <section className="marketplace-onboarding-layout">
        <aside className="panel onboarding-side-panel">
          <WizardStepper steps={steps} currentStep={step} onStepChange={setStep} />
          <div className="security-note">
            <AlertTriangle size={18} />
            <span>API bilgileri sadece yetkili kullanicilar tarafindan girilmeli. Kayitli gizli anahtarlar listelerde maskeli gosterilir.</span>
          </div>
        </aside>

        <section className="panel onboarding-main-panel">
          {error && <ErrorState message={friendlyMarketplaceError(error)} onRetry={load} />}
          {loading && companies.length === 0 ? <LoadingState /> : null}

          {step === 0 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 1 / 6</span>
                <h2>Pazaryeri secimi</h2>
                <p>Aktif entegrasyonlardan birini secin. Yakinda etiketli pazaryerleri icin ekran hazir tutulur ama baglanti acilmaz.</p>
              </div>
              <div className="marketplace-options-grid">
                {marketplaceOptions.map((option) => (
                  <MarketplaceOptionCard
                    key={option.code}
                    option={option}
                    selected={form.code === option.code}
                    onSelect={() => setForm({ ...initialForm, company_id: form.company_id, code: option.code })}
                  />
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 2 / 6</span>
                <h2>Magaza ve firma bilgileri</h2>
                <p>Bu bilgiler hesabinizin hangi firmaya ait oldugunu ve pazaryerinde hangi satici hesabi ile calisacagini belirler.</p>
              </div>
              <div className="form-grid">
                <Field label="Firma" error={errors.company_id}>
                  <select value={form.company_id} onChange={(event) => setValue('company_id', event.target.value)}>
                    <option value="">Firma seciniz</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </Field>
                <Field label="Magaza Adi" error={errors.name}><input value={form.name} onChange={(event) => setValue('name', event.target.value)} placeholder={`${selectedMarketplace.name} magazasi`} /></Field>
                {form.code === 'trendyol' ? (
                  <Field label="Trendyol Supplier ID" error={errors.supplier_id}><input value={form.supplier_id} onChange={(event) => setValue('supplier_id', event.target.value)} /></Field>
                ) : (
                  <Field label="Hepsiburada Merchant ID" error={errors.merchant_id}><input value={form.merchant_id} onChange={(event) => setValue('merchant_id', event.target.value)} /></Field>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 3 / 6</span>
                <h2>API bilgileri</h2>
                <p>API bilgilerinizi pazaryeri panelinizden alip buraya girin. Test ortaminda deneme yapip canli ortama sonra gecebilirsiniz.</p>
              </div>
              <div className="form-grid">
                <Field label={form.code === 'hepsiburada' ? 'Kullanici Adi / API Key' : 'API Key'} error={errors.api_key}>
                  <input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value, service_username: event.target.value })} />
                </Field>
                <Field label={form.code === 'hepsiburada' ? 'Parola / API Secret' : 'API Secret'} error={errors.api_secret}>
                  <CredentialInput value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value, service_password: event.target.value })} />
                </Field>
                <Field label="Ortam">
                  <select value={form.environment} onChange={(event) => setValue('environment', event.target.value)}>
                    <option value="stage">Test Ortami</option>
                    <option value="production">Canli Ortam</option>
                  </select>
                </Field>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 4 / 6</span>
                <h2>Baglanti testi</h2>
                <p>Hesap once kaydedilir, sonra mevcut pazaryeri test servisi calistirilir. Basarili testten sonra ilk senkronizasyon adimlarina gecebilirsiniz.</p>
              </div>
              <ConnectionStatusCard {...testStatus} />
              <div className="wizard-actions inline-actions">
                <button type="button" className="secondary-button" disabled={loading} onClick={saveAccount}>Sadece Kaydet</button>
                <button type="button" disabled={loading} onClick={testConnection}><RefreshCw size={16} /> Kaydet ve Test Et</button>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 5 / 6</span>
                <h2>Ilk senkronizasyon onerileri</h2>
                <p>Kurulumdan sonra once kategori verilerini cekin, ardindan urun, stok/fiyat ve siparis akislarini kontrollu baslatin.</p>
              </div>
              <div className="sync-suggestion-grid">
                <button type="button" onClick={() => executeSuggestion('categories')} disabled={loading}><Boxes size={17} /> Kategori Cek</button>
                <button type="button" onClick={() => executeSuggestion('products')} disabled={loading}><PackagePlus size={17} /> Urun Gonder</button>
                <button type="button" onClick={() => executeSuggestion('prices')} disabled={loading}><RefreshCw size={17} /> Stok/Fiyat Guncelle</button>
                <button type="button" onClick={() => executeSuggestion('orders')} disabled={loading}><Truck size={17} /> Siparisleri Cek</button>
              </div>
            </>
          )}

          {step === 5 && (
            <>
              <div className="completion-card">
                <Rocket size={36} />
                <h2>Kurulum akisi tamamlandi</h2>
                <p>{selectedMarketplace.name} hesabi kaydedildi. Bundan sonra kategori eslestirme, aktarim listesi ve siparis kontrollerine gecebilirsiniz.</p>
              </div>
              <div className="quick-actions-grid">
                <Link className="button-link" to="/marketplaces">Pazaryeri Hesaplari</Link>
                <Link className="button-link secondary-link" to="/marketplace-mapping/categories">Kategori Eslestirme</Link>
                <Link className="button-link secondary-link" to="/products/publish-queue">Aktarim Listesi</Link>
                <Link className="button-link secondary-link" to="/resources">Developer Center <ExternalLink size={14} /></Link>
              </div>
            </>
          )}

          <div className="wizard-actions">
            <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => Math.max(current - 1, 0))}>Geri</button>
            {step < 5 ? (
              <button type="button" disabled={loading} onClick={goNext}>Sonraki</button>
            ) : (
              <Link className="button-link" to="/marketplaces">Hesaplari Gor</Link>
            )}
            {loading && <span className="wizard-save-state"><RefreshCw size={16} /> Islem suruyor...</span>}
          </div>
        </section>
      </section>
    </>
  );
}
