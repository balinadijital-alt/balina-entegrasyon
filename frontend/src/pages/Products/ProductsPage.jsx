import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, Upload } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function ProductsPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [imageProductId, setImageProductId] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [companyId, setCompanyId] = useState('');

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
      <PageHeader title="Urunler" actions={<Link className="button-link" to="/products/new"><PackagePlus size={16} /> Urun Ekle</Link>} />
      <PageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Urun, SKU veya barkod ara"
        filters={(
          <>
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">Tum firmalar</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tum durumlar</option>
              <option value="draft">Taslak</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </>
        )}
      />
      <section className="panel compact-panel">
        <h2>Gorsel Yukleme</h2>
        <form className="form-grid" onSubmit={uploadImage}>
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
        rows={products.filter((product) => {
          const query = search.trim().toLowerCase();
          const matchesSearch = !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
          const matchesStatus = !status || product.status === status;
          const matchesCompany = !companyId || String(product.company_id) === String(companyId);
          return matchesSearch && matchesStatus && matchesCompany;
        })}
        emptyTitle="Urun bulunamadi"
        emptyText="Filtreleri temizleyin veya yeni urun ekleyin."
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
