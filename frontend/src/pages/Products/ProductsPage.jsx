import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
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

export function ProductsPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [importFile, setImportFile] = useState(null);
  const [imageProductId, setImageProductId] = useState('');
  const [imageFile, setImageFile] = useState(null);

  const load = async () => {
    await run(async () => {
      const [productResponse, companyResponse] = await Promise.all([api.products.list(), api.companies.list()]);
      setProducts(productResponse.data || []);
      setCompanies(companyResponse.data || []);
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
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const importProducts = async (event) => {
    event.preventDefault();
    if (!form.company_id || !importFile) {
      setError('Toplu yukleme icin firma ve dosya secimi zorunludur.');
      return;
    }
    const body = new FormData();
    body.append('company_id', form.company_id);
    body.append('file', importFile);
    await run(async () => {
      const result = await api.products.import(body);
      notify('success', `${result.created} yeni, ${result.updated} guncel urun islendi.`);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const uploadImage = async (event) => {
    event.preventDefault();
    if (!imageProductId || !imageFile) {
      setError('Gorsel yuklemek icin urun ve dosya secimi zorunludur.');
      return;
    }
    const body = new FormData();
    body.append('image', imageFile);
    await run(async () => {
      await api.products.uploadImage(imageProductId, body);
      notify('success', 'Gorsel yuklendi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Urun Yonetimi" />
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
      <section className="split">
        <form className="panel compact-panel" onSubmit={importProducts}>
          <h2>Excel ile Toplu Yukleme</h2>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setImportFile(event.target.files[0])} />
          <button disabled={loading}><Upload size={16} /> Yukle</button>
        </form>
        <form className="panel compact-panel" onSubmit={uploadImage}>
          <h2>Gorsel Yukleme</h2>
          <select value={imageProductId} onChange={(event) => setImageProductId(event.target.value)}>
            <option value="">Urun seciniz</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files[0])} />
          <button disabled={loading}><Upload size={16} /> Gorsel Yukle</button>
        </form>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={products}
        columns={[
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Urun' },
          { key: 'company', label: 'Firma', render: (row) => row.company?.name },
          { key: 'price', label: 'Fiyat' },
          { key: 'stock', label: 'Stok' },
          { key: 'status', label: 'Durum' },
        ]}
      />
      )}
    </>
  );
}
