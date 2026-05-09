import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
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
  is_active: true,
};

export function MarketplacesPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [syncing, setSyncing] = useState('');
  const [categories, setCategories] = useState([]);

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse] = await Promise.all([api.marketplaces.list(), api.companies.list()]);
      setAccounts(accountResponse.data || []);
      setCompanies(companyResponse.data || []);
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
      await api.marketplaces.create(form);
      setForm(initialForm);
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
      };
      const response = await actions[type]();
      const categoryCount = response.categories?.length;
      if (response.categories) {
        setCategories(response.categories);
      }
      const message = categoryCount !== undefined ? `${categoryCount} Trendyol kategorisi cekildi.` : response.message;
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
      <PageHeader title="Pazaryeri Entegrasyonlari" />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma" error={errors.company_id}>
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Pazaryeri">
            <select value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })}>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
            </select>
          </Field>
          <Field label="Hesap Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Supplier ID" error={errors.supplier_id}><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} /></Field>
          <Field label="Merchant ID" error={errors.merchant_id}><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="API Key"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
          <Field label="API Secret"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Entegrasyon Ekle'}</button>
        </form>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {syncing && <LoadingState label="Trendyol senkronizasyonu calisiyor..." />}
      {categories.length > 0 && (
        <section className="panel compact-panel">
          <h2>Trendyol Kategorileri</h2>
          <div className="category-list">
            {categories.slice(0, 12).map((category) => (
              <span key={category.id}>{category.name}</span>
            ))}
          </div>
        </section>
      )}
      {loading && accounts.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={accounts}
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
              </div>
            ),
          },
        ]}
      />
      )}
    </>
  );
}
