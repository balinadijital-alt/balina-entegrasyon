import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { api, jsonBody } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Field } from '../../components/Field.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

const initialForm = {
  company_id: '',
  sku: '',
  barcode: '',
  name: '',
  brand: '',
  category: '',
  price: 0,
  stock: 0,
  vat_rate: 20,
  status: 'draft',
};

export function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [importFile, setImportFile] = useState(null);
  const [imageProductId, setImageProductId] = useState('');
  const [imageFile, setImageFile] = useState(null);

  const load = async () => {
    const [productResponse, companyResponse] = await Promise.all([api('/products'), api('/companies')]);
    setProducts(productResponse.data || []);
    setCompanies(companyResponse.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    await api('/products', { method: 'POST', body: jsonBody(form) });
    setForm(initialForm);
    load();
  };

  const importProducts = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append('company_id', form.company_id);
    body.append('file', importFile);
    await api('/products/import', { method: 'POST', body });
    load();
  };

  const uploadImage = async (event) => {
    event.preventDefault();
    const body = new FormData();
    body.append('image', imageFile);
    await api(`/products/${imageProductId}/images`, { method: 'POST', body });
    load();
  };

  return (
    <>
      <PageHeader title="Urun Yonetimi" />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma">
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="SKU"><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>
          <Field label="Barkod"><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></Field>
          <Field label="Urun Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Marka"><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
          <Field label="Kategori"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
          <Field label="Fiyat"><input type="number" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field>
          <Field label="Stok"><input type="number" value={form.stock} onChange={(event) => setForm({ ...form, stock: event.target.value })} /></Field>
          <Field label="KDV"><input type="number" value={form.vat_rate} onChange={(event) => setForm({ ...form, vat_rate: event.target.value })} /></Field>
          <Field label="Durum">
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="draft">Taslak</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </Field>
          <button>Urun Ekle</button>
        </form>
      </section>
      <section className="split">
        <form className="panel compact-panel" onSubmit={importProducts}>
          <h2>Excel ile Toplu Yukleme</h2>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setImportFile(event.target.files[0])} />
          <button><Upload size={16} /> Yukle</button>
        </form>
        <form className="panel compact-panel" onSubmit={uploadImage}>
          <h2>Gorsel Yukleme</h2>
          <select value={imageProductId} onChange={(event) => setImageProductId(event.target.value)}>
            <option value="">Urun seciniz</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files[0])} />
          <button><Upload size={16} /> Gorsel Yukle</button>
        </form>
      </section>
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
    </>
  );
}
