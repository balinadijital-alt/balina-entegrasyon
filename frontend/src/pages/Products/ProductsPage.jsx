import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackagePlus, Send, Upload } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function marketplaceStatus(product, code) {
  return product.marketplace_statuses?.find((status) => status.marketplace_code === code);
}

function missingFields(product) {
  const statuses = product.marketplace_statuses || [];
  return [...new Set(statuses.flatMap((status) => status.missing_fields || []))];
}

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
  const [selected, setSelected] = useState([]);
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickEdit, setQuickEdit] = useState({ price: '', stock: '', status: 'active' });

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

  const toggleSelected = (id) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const startQuickEdit = (product) => {
    setQuickEditId(product.id);
    setQuickEdit({ price: product.price || '', stock: product.stock || 0, status: product.status || 'active' });
  };

  const saveQuickEdit = async (product) => {
    await run(async () => {
      await api.products.update(product.id, {
        ...product,
        price: Number(quickEdit.price),
        stock: Number(quickEdit.stock),
        status: quickEdit.status,
        gallery_images: product.gallery_images || [],
        variant_options: product.variant_options || null,
        trendyol_attributes: product.trendyol_attributes || null,
        hepsiburada_attributes: product.hepsiburada_attributes || null,
      });
      notify('success', 'Urun hizli guncellendi.');
      setQuickEditId(null);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const filteredProducts = products.filter((product) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [product.name, product.sku, product.barcode].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !status || product.status === status;
    const matchesCompany = !companyId || String(product.company_id) === String(companyId);
    return matchesSearch && matchesStatus && matchesCompany;
  });

  return (
    <>
      <PageHeader
        title="Urunler"
        actions={(
          <>
            <Link className="button-link secondary-link" to="/products/publish"><Send size={16} /> Toplu Gonder</Link>
            <Link className="button-link" to="/products/new"><PackagePlus size={16} /> Urun Ekle</Link>
          </>
        )}
      />
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
      <section className="kpi-grid">
        <div className="kpi-card"><span>Toplam Urun</span><strong>{products.length}</strong><small>Katalog kaydi</small></div>
        <div className="kpi-card"><span>Pazaryerine Hazir</span><strong>{products.filter((product) => product.marketplace_ready).length}</strong><small>Eksiksiz urun</small></div>
        <div className="kpi-card"><span>Eksik Alan</span><strong>{products.filter((product) => !product.marketplace_ready).length}</strong><small>Kontrol gerekli</small></div>
        <div className="kpi-card"><span>Secili</span><strong>{selected.length}</strong><small>Toplu aksiyon</small></div>
      </section>
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
      {selected.length > 0 && (
        <section className="state-box">
          <span>{selected.length} urun secildi.</span>
          <Link className="button-link" to="/products/publish"><Send size={16} /> Secilenleri Gonder</Link>
        </section>
      )}
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={filteredProducts}
          emptyTitle="Urun bulunamadi"
          emptyText="Filtreleri temizleyin veya yeni urun ekleyin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selected.includes(row.id)} onChange={() => toggleSelected(row.id)} /> },
            { key: 'sku', label: 'SKU' },
            { key: 'name', label: 'Urun' },
            { key: 'ready', label: 'Hazirlik', render: (row) => <span className={row.marketplace_ready ? 'status-pill ready' : 'status-pill blocked'}>{row.marketplace_ready ? 'Hazir' : 'Eksik'}</span> },
            { key: 'trendyol', label: 'Trendyol', render: (row) => marketplaceStatus(row, 'trendyol')?.status || marketplaceStatus(row, 'trendyol')?.readiness_status || '-' },
            { key: 'hepsiburada', label: 'Hepsiburada', render: (row) => marketplaceStatus(row, 'hepsiburada')?.status || marketplaceStatus(row, 'hepsiburada')?.readiness_status || '-' },
            { key: 'missing', label: 'Eksikler', render: (row) => missingFields(row).slice(0, 4).join(', ') || '-' },
            { key: 'price', label: 'Fiyat', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.price} onChange={(event) => setQuickEdit({ ...quickEdit, price: event.target.value })} /> : row.price },
            { key: 'stock', label: 'Stok', render: (row) => quickEditId === row.id ? <input type="number" value={quickEdit.stock} onChange={(event) => setQuickEdit({ ...quickEdit, stock: event.target.value })} /> : row.stock },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => quickEditId === row.id ? (
                <div className="row-actions">
                  <select value={quickEdit.status} onChange={(event) => setQuickEdit({ ...quickEdit, status: event.target.value })}>
                    <option value="draft">Taslak</option>
                    <option value="active">Aktif</option>
                    <option value="passive">Pasif</option>
                  </select>
                  <button type="button" disabled={loading} onClick={() => saveQuickEdit(row)}>Kaydet</button>
                </div>
              ) : (
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => startQuickEdit(row)}>Hizli Duzenle</button>
                  <Link className="button-link" to="/products/publish"><Send size={15} /> Gonder</Link>
                </div>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
