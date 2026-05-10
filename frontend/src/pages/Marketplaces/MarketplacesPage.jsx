import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
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
      setAccounts((accountResponse.data || []).filter((account) => !provider || account.code === provider));
      setCompanies(companyResponse.data || []);
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
      const categoryCount = response.categories?.length;
      if (response.categories) {
        setCategories(response.categories);
      }
      const marketplaceName = type.startsWith('hb') || provider === 'hepsiburada' ? 'Hepsiburada' : 'Trendyol';
      const message = categoryCount !== undefined ? `${categoryCount} ${marketplaceName} kategorisi cekildi.` : response.message;
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
      <section className="panel">
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
            </select>
          </Field>
          <Field label="Hesap Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Supplier ID" error={errors.supplier_id}><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} /></Field>
          <Field label="Merchant ID" error={errors.merchant_id}><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="API Key / Kullanici Adi" error={errors.service_username}>
            <input
              value={form.api_key}
              onChange={(event) => setForm({ ...form, api_key: event.target.value, service_username: event.target.value })}
            />
          </Field>
          <Field label="API Secret / Password" error={errors.service_password}>
            <input
              type="password"
              value={form.api_secret}
              onChange={(event) => setForm({ ...form, api_secret: event.target.value, service_password: event.target.value })}
            />
          </Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Entegrasyon Ekle'}</button>
        </form>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {syncing && <LoadingState label="Senkronizasyon calisiyor..." />}
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
      {loading && accounts.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={accounts.filter((account) => {
          const query = search.trim().toLowerCase();
          const matchesSearch = !query || [account.name, account.code, account.company?.name].some((value) => String(value || '').toLowerCase().includes(query));
          const matchesStatus = !status || account.connection_status === status;
          return matchesSearch && matchesStatus;
        })}
        emptyTitle="Pazaryeri hesabi yok"
        emptyText="Yeni entegrasyon ekleyin veya filtreleri temizleyin."
        columns={[
          { key: 'name', label: 'Hesap' },
          { key: 'code', label: 'Pazaryeri' },
          { key: 'company', label: 'Firma', render: (row) => row.company?.name },
          { key: 'connection_status', label: 'Baglanti', render: (row) => <span className={`badge ${row.connection_status}`}>{row.connection_status || 'unknown'}</span> },
          { key: 'last_product_sync_at', label: 'Son Urun', render: (row) => formatDate(row.last_product_sync_at) },
          { key: 'last_price_sync_at', label: 'Son Stok/Fiyat', render: (row) => formatDate(row.last_price_sync_at) },
          { key: 'last_order_sync_at', label: 'Son Siparis', render: (row) => formatDate(row.last_order_sync_at) },
          { key: 'last_error', label: 'Son Hata', render: (row) => row.last_error || '-' },
          {
            key: 'actions',
            label: 'Islemler',
            render: (row) => (
              <div className="row-actions">
                {row.code === 'trendyol' && (
                  <>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'test')}><RefreshCw size={15} /> {syncLabel(row.id, 'test', 'Test')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'categories')}><RefreshCw size={15} /> {syncLabel(row.id, 'categories', 'Kategori')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'products')}><RefreshCw size={15} /> {syncLabel(row.id, 'products', 'Urun')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'prices')}><RefreshCw size={15} /> {syncLabel(row.id, 'prices', 'Stok/Fiyat')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'orders')}><RefreshCw size={15} /> {syncLabel(row.id, 'orders', 'Siparis')}</button>
                  </>
                )}
                {row.code === 'hepsiburada' && (
                  <>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'hbTest')}><RefreshCw size={15} /> {syncLabel(row.id, 'hbTest', 'Test')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'hbCategories')}><RefreshCw size={15} /> {syncLabel(row.id, 'hbCategories', 'Kategori')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'hbProducts')}><RefreshCw size={15} /> {syncLabel(row.id, 'hbProducts', 'Urun')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'hbPrices')}><RefreshCw size={15} /> {syncLabel(row.id, 'hbPrices', 'Stok/Fiyat')}</button>
                    <button type="button" disabled={loading || syncing} onClick={() => sync(row.id, 'hbOrders')}><RefreshCw size={15} /> {syncLabel(row.id, 'hbOrders', 'Siparis')}</button>
                  </>
                )}
              </div>
            ),
          },
        ]}
      />
      )}
    </>
  );
}
