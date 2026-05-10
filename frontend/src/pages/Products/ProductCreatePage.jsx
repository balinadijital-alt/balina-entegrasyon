import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, validateProduct } from '../../utils/validation.js';

const initialForm = {
  company_id: '',
  sku: '',
  barcode: '',
  name: '',
  brand: '',
  trendyol_brand_id: '',
  category: '',
  trendyol_category_id: '',
  price: 0,
  list_price: '',
  stock: 0,
  vat_rate: 20,
  dimensional_weight: 1,
  trendyol_attributes: '',
  status: 'draft',
};

export function ProductCreatePage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  const load = async () => {
    await run(async () => {
      const response = await api.companies.list();
      setCompanies(response.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = validateProduct(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      await api.products.create({
        ...form,
        price: Number(form.price),
        list_price: form.list_price === '' ? null : Number(form.list_price),
        stock: Number(form.stock),
        vat_rate: Number(form.vat_rate),
        dimensional_weight: Number(form.dimensional_weight || 1),
        trendyol_brand_id: form.trendyol_brand_id === '' ? null : Number(form.trendyol_brand_id),
        trendyol_category_id: form.trendyol_category_id === '' ? null : Number(form.trendyol_category_id),
        trendyol_attributes: form.trendyol_attributes ? JSON.parse(form.trendyol_attributes) : null,
      });
      setForm(initialForm);
      notify('success', 'Urun kaydedildi.');
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Urun Ekle" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && companies.length === 0 ? <LoadingState /> : null}
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma" error={errors.company_id}>
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="SKU" error={errors.sku}><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>
          <Field label="Barkod"><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></Field>
          <Field label="Urun Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Marka"><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
          <Field label="Trendyol Marka ID"><input type="number" value={form.trendyol_brand_id} onChange={(event) => setForm({ ...form, trendyol_brand_id: event.target.value })} /></Field>
          <Field label="Kategori"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
          <Field label="Trendyol Kategori ID"><input type="number" value={form.trendyol_category_id} onChange={(event) => setForm({ ...form, trendyol_category_id: event.target.value })} /></Field>
          <Field label="Fiyat" error={errors.price}><input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
          <Field label="Liste Fiyati"><input type="number" value={form.list_price} onChange={(event) => setForm({ ...form, list_price: event.target.value })} /></Field>
          <Field label="Stok" error={errors.stock}><input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></Field>
          <Field label="KDV"><input type="number" value={form.vat_rate} onChange={(event) => setForm({ ...form, vat_rate: event.target.value })} /></Field>
          <Field label="Desi"><input type="number" value={form.dimensional_weight} onChange={(event) => setForm({ ...form, dimensional_weight: event.target.value })} /></Field>
          <Field label="Trendyol Ozellikleri JSON" error={errors.trendyol_attributes}>
            <textarea value={form.trendyol_attributes} onChange={(event) => setForm({ ...form, trendyol_attributes: event.target.value })} placeholder='[{"attributeId":1,"attributeValueId":1}]' />
          </Field>
          <Field label="Durum">
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="draft">Taslak</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Urun Ekle'}</button>
        </form>
      </section>
    </>
  );
}
