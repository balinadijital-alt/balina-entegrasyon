import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCw, ShoppingBag, Store } from 'lucide-react';
import { api, asArray } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, validateMarketplace } from '../../utils/validation.js';

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
  is_active: true,
};

const marketplaceNames = {
  trendyol: 'Trendyol',
  hepsiburada: 'Hepsiburada',
  ciceksepeti: 'Ciceksepeti',
};

function statusLabel(value) {
  if (value === 'connected') return 'Bagli';
  if (value === 'failed') return 'Hata var';
  if (value === 'pending') return 'Bekliyor';
  return value || 'Kontrol edilmedi';
}

export function MarketplacesPage({ provider = '', title = 'Pazaryerleri' }) {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState({ ...initialForm, code: provider || initialForm.code });
  const [errors, setErrors] = useState({});
  const [syncing, setSyncing] = useState('');
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse] = await Promise.all([api.marketplaces.list(), api.companies.list()]);
      setAccounts(asArray(accountResponse).filter((account) => !provider || account.code === provider));
      setCompanies(asArray(companyResponse));
      setForm((current) => ({ ...current, code: provider || current.code }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = validateMarketplace(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      await api.marketplaces.create({ ...form, code: provider || form.code });
      setForm({ ...initialForm, code: provider || 'trendyol' });
      notify('success', 'Entegrasyon kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sync = async (id, type) => {
    const actionKey = `${id}:${type}`;
    setSyncing(actionKey);
    await run(async () => {
      const actions = {
        test: () => api.marketplaces.trendyolTest(id),
        categories: () => api.marketplaces.trendyolCategories(id),
        products: () => api.marketplaces.trendyolSendProducts(id),
        prices: () => api.marketplaces.trendyolUpdatePriceInventory(id),
        orders: () => api.marketplaces.trendyolPullOrders(id),
        hbTest: () => api.marketplaces.hepsiburadaTest(id),
        hbCategories: () => api.marketplaces.hepsiburadaCategories(id),
        hbProducts: () => api.marketplaces.hepsiburadaSendProducts(id),
        hbPrices: () => api.marketplaces.hepsiburadaUpdatePriceInventory(id),
        hbOrders: () => api.marketplaces.hepsiburadaPullOrders(id),
      };
      const response = await actions[type]();
      const nextCategories = asArray(response?.categories);
      const hasCategoryPayload = response && Object.prototype.hasOwnProperty.call(response, 'categories');
      const categoryCount = nextCategories.length;
      if (hasCategoryPayload) {
        setCategories(nextCategories);
      }
      const marketplaceName = type.startsWith('hb') || provider === 'hepsiburada' ? 'Hepsiburada' : 'Trendyol';
      const message = hasCategoryPayload ? `${categoryCount} ${marketplaceName} kategorisi cekildi.` : response.message;
      if (message) notify('success', message);
      await load();
    }, { onError: (message) => notify('error', message) });
    setSyncing('');
  };

  const syncLabel = (id, type, label) => syncing === `${id}:${type}` ? 'Calisiyor...' : label;

  const formatDate = (value) => {
    if (!value) return '-';
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  };

  const visibleAccounts = accounts.filter((account) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [account.name, account.code, account.company?.name].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !status || account.connection_status === status;
    return matchesSearch && matchesStatus;
  });

  return (
    <>
      <PageHeader title={title} />
      <PageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Hesap veya firma ara"
        filters={(
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tum baglantilar</option>
            <option value="connected">Bagli</option>
            <option value="failed">Basarisiz</option>
            <option value="pending">Bekliyor</option>
          </select>
        )}
      />
      {loading && accounts.length === 0 ? <LoadingState /> : (
        <section className="marketplace-card-grid">
          {visibleAccounts.length === 0 ? (
            <div className="panel empty-state">
              <Store size={28} />
              <strong>Pazaryeri baglantisi yok</strong>
              <span>Trendyol veya Hepsiburada hesabinizi ekleyerek urun, stok/fiyat ve siparis islemlerini baslatin.</span>
            </div>
          ) : visibleAccounts.map((account) => {
            const isHepsiburada = account.code === 'hepsiburada';
            const Icon = isHepsiburada ? ShoppingBag : Store;
            const hasError = account.connection_status === 'failed' || Boolean(account.last_error);

            return (
              <article className="marketplace-account-card" key={account.id}>
                <div className="marketplace-card-top">
                  <span className="marketplace-card-icon"><Icon size={20} /></span>
                  <div>
                    <strong>{marketplaceNames[account.code] || account.code}</strong>
                    <small>{account.name} · {account.company?.name || 'Firma yok'}</small>
                  </div>
                  <StatusPill tone={hasError ? 'blocked' : 'ready'} label={statusLabel(account.connection_status)} />
                </div>
                <div className="marketplace-card-stats">
                  <div><span>Son urun</span><strong>{formatDate(account.last_product_sync_at)}</strong></div>
                  <div><span>Son stok/fiyat</span><strong>{formatDate(account.last_price_sync_at)}</strong></div>
                  <div><span>Son siparis</span><strong>{formatDate(account.last_order_sync_at)}</strong></div>
                  <div><span>Hata</span><strong>{hasError ? 'Var' : 'Yok'}</strong></div>
                </div>
                {account.last_error && <SoftEmpty className="error-state"><AlertTriangle size={16} /> {account.last_error}</SoftEmpty>}
                <div className="row-actions marketplace-card-actions">
                  <button type="button" disabled={loading || syncing} onClick={() => sync(account.id, isHepsiburada ? 'hbTest' : 'test')}><CheckCircle2 size={15} /> {syncLabel(account.id, isHepsiburada ? 'hbTest' : 'test', 'Baglantiyi Kontrol Et')}</button>
                  <button type="button" className="secondary-button" disabled={loading || syncing} onClick={() => sync(account.id, isHepsiburada ? 'hbProducts' : 'products')}><RefreshCw size={15} /> Urunleri Gonder</button>
                  <button type="button" className="secondary-button" disabled={loading || syncing} onClick={() => sync(account.id, isHepsiburada ? 'hbPrices' : 'prices')}>Stok/Fiyat Guncelle</button>
                  <button type="button" className="secondary-button" disabled={loading || syncing} onClick={() => sync(account.id, isHepsiburada ? 'hbOrders' : 'orders')}>Siparisleri Al</button>
                </div>
              </article>
            );
          })}
          {!provider && (
            <article className="marketplace-account-card disabled-marketplace-card">
              <div className="marketplace-card-top">
                <span className="marketplace-card-icon"><ShoppingBag size={20} /></span>
                <div>
                  <strong>Ciceksepeti</strong>
                  <small>Bu pazaryeri yakinda aktif olacak.</small>
                </div>
                <StatusPill tone="blocked" label="Yakinda" />
              </div>
              <div className="marketplace-card-stats">
                <div><span>Baglanti</span><strong>Pasif</strong></div>
                <div><span>Son urun</span><strong>-</strong></div>
                <div><span>Son stok/fiyat</span><strong>-</strong></div>
                <div><span>Hata</span><strong>-</strong></div>
              </div>
              <button type="button" disabled>Yakinda</button>
            </article>
          )}
        </section>
      )}

      <details className="panel marketplace-form-panel">
        <summary>Yeni pazaryeri hesabi ekle</summary>
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma" error={errors.company_id}>
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Pazaryeri">
            <select value={form.code} disabled={!!provider} onChange={(event) => setForm({ ...form, code: event.target.value })}>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
              <option value="ciceksepeti">Ciceksepeti</option>
            </select>
          </Field>
          <Field label="Hesap Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Trendyol Satici No" error={errors.supplier_id}><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} /></Field>
          <Field label="Hepsiburada Magaza No" error={errors.merchant_id}><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="Kullanici Adi / Anahtar" error={errors.service_username}>
            <input
              value={form.api_key}
              onChange={(event) => setForm({ ...form, api_key: event.target.value, service_username: event.target.value })}
            />
          </Field>
          <Field label="Sifre / Gizli Anahtar" error={errors.service_password}>
            <input
              type="password"
              value={form.api_secret}
              onChange={(event) => setForm({ ...form, api_secret: event.target.value, service_password: event.target.value })}
            />
          </Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Baglanti Ekle'}</button>
        </form>
      </details>
      {error && <ErrorState message={error} onRetry={load} />}
      {syncing && <LoadingState label="Islem calisiyor..." />}
      {categories.length > 0 && (
        <section className="panel compact-panel">
          <h2>Pazaryeri Kategorileri</h2>
          <div className="category-list">
            {categories.slice(0, 12).map((category) => (
              <span key={category.id || category.categoryId || category.name}>{category.name || category.categoryName}</span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
