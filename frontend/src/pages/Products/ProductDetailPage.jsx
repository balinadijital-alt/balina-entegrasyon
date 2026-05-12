import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Edit3, ImagePlus, Layers3, Send, Upload } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { marketplaceStatus, missingFields, productImage, publishBlockReason, readinessScore } from './productWorkflow.js';

const tabs = [
  ['general', 'Genel Bilgiler'],
  ['variants', 'Varyantlar'],
  ['images', 'Gorseller'],
  ['seo', 'Aciklama/SEO'],
  ['readiness', 'Pazaryeri Hazirligi'],
  ['history', 'Gonderim Gecmisi'],
  ['errors', 'API Hatalari'],
];

export function ProductDetailPage() {
  const { id } = useParams();
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [product, setProduct] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [activeTab, setActiveTab] = useState('general');
  const [imageFile, setImageFile] = useState(null);

  const load = async () => {
    await run(async () => {
      const [productResponse, readinessResponse] = await Promise.all([api.products.show(id), api.products.readiness(id)]);
      setProduct(productResponse);
      setReadiness(readinessResponse);
    });
  };

  useEffect(() => {
    load();
  }, [id]);

  const uploadImage = async (event) => {
    event.preventDefault();
    if (!imageFile) {
      notify('error', 'Yuklemek icin gorsel seciniz.');
      return;
    }
    const body = new FormData();
    body.append('image', imageFile);
    await run(async () => {
      await api.products.uploadImage(id, body);
      setImageFile(null);
      notify('success', 'Urun gorseli yuklendi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const statusRows = useMemo(() => {
    if (!product) return [];
    return ['trendyol', 'hepsiburada'].map((code) => ({
      id: code,
      marketplace: code,
      status: marketplaceStatus(product, code)?.status || '-',
      readiness: marketplaceStatus(product, code)?.readiness_status || (readiness?.marketplaces?.[code]?.ready ? 'Hazir' : 'Eksik'),
      missing: readiness?.marketplaces?.[code]?.missing_fields?.join(', ') || '-',
      last_sent_at: marketplaceStatus(product, code)?.last_sent_at || '-',
      error: marketplaceStatus(product, code)?.error_message || '-',
    }));
  }, [product, readiness]);

  if (loading && !product) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!product) return null;

  const image = productImage(product);
  const missing = missingFields(product);

  return (
    <>
      <PageHeader
        title="Urun Detay"
        actions={(
          <>
            <Link className="button-link secondary-link" to={`/products/${product.id}/edit`}><Edit3 size={16} /> Duzenle</Link>
            <Link className="button-link secondary-link" to={`/products/category-mapping?category=${encodeURIComponent(product.category || '')}`}><Layers3 size={16} /> Kategori Esle</Link>
            <Link className="button-link" to={`/products/publish?product=${product.id}`}><Send size={16} /> Gonder</Link>
          </>
        )}
      />

      {missing.length > 0 && (
        <section className="state-box workflow-warning">
          <AlertTriangle size={18} />
          <span>Eksik alanlar: {missing.join(', ')}. Gonderimden once kategori eslesmesi ve zorunlu ozellikler tamamlanmali.</span>
        </section>
      )}

      <section className="product-detail-hero">
        <div className="product-detail-media">
          {image ? <img src={image} alt={product.name} /> : <span>Gorsel yok</span>}
        </div>
        <div className="product-detail-summary">
          <span className="eyebrow">{product.company?.name || 'Firma yok'}</span>
          <h2>{product.name}</h2>
          <div className="detail-grid">
            <div className="detail-card"><span>SKU</span><strong>{product.sku}</strong></div>
            <div className="detail-card"><span>Barkod</span><strong>{product.barcode || '-'}</strong></div>
            <div className="detail-card"><span>Kategori</span><strong>{product.category || '-'}</strong></div>
            <div className="detail-card"><span>Readiness</span><strong>{readinessScore(product)}%</strong></div>
          </div>
          <div className="readiness-meter">
            <div><span style={{ width: `${readinessScore(product)}%` }} /></div>
            <small>{publishBlockReason(product)}</small>
          </div>
        </div>
      </section>

      <div className="tabs">
        {tabs.map(([key, label]) => <button type="button" className={activeTab === key ? 'tab active' : 'tab'} key={key} onClick={() => setActiveTab(key)}>{label}</button>)}
      </div>

      {activeTab === 'general' && (
        <section className="panel">
          <div className="detail-grid">
            <div className="detail-card"><span>Marka</span><strong>{product.brand || '-'}</strong></div>
            <div className="detail-card"><span>Tip</span><strong>{product.product_type}</strong></div>
            <div className="detail-card"><span>Stok</span><strong>{product.stock}</strong></div>
            <div className="detail-card"><span>Fiyat</span><strong>{product.price}</strong></div>
            <div className="detail-card"><span>KDV</span><strong>%{product.vat_rate}</strong></div>
            <div className="detail-card"><span>Desi</span><strong>{product.dimensional_weight || '-'}</strong></div>
            <div className="detail-card"><span>Durum</span><strong>{product.status}</strong></div>
          </div>
        </section>
      )}

      {activeTab === 'variants' && (
        <section className="panel">
          <h2>Varyantlar</h2>
          <pre className="json-preview">{JSON.stringify(product.variant_options || [], null, 2)}</pre>
        </section>
      )}

      {activeTab === 'images' && (
        <>
          <section className="panel compact-panel">
            <h2>Gorsel Yukleme</h2>
            <form className="form-grid" onSubmit={uploadImage}>
              <label className="drag-drop-card">
                <ImagePlus size={18} />
                <span>{imageFile ? imageFile.name : 'Ana veya galeri gorseli sec'}</span>
                <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files[0])} />
              </label>
              <button disabled={loading}><Upload size={16} /> Gorsel Yukle</button>
            </form>
          </section>
          <section className="product-image-grid">
            {[product.main_image_url, ...(product.gallery_images || []), ...(product.images || []).map((item) => item.url || item.path)].filter(Boolean).map((url) => (
              <div className="product-image-card" key={url}><img src={url} alt={product.name} /></div>
            ))}
          </section>
        </>
      )}

      {activeTab === 'seo' && (
        <section className="panel compact-panel">
          <div className="soft-empty"><strong>Kisa Aciklama</strong><span>{product.short_description || '-'}</span></div>
          <div className="soft-empty"><strong>Detayli Aciklama</strong><span>{product.description || '-'}</span></div>
          <div className="soft-empty"><strong>SEO</strong><span>{product.seo_title || '-'} · {product.seo_description || '-'}</span></div>
        </section>
      )}

      {activeTab === 'readiness' && (
        <DataTable
          rows={statusRows}
          columns={[
            { key: 'marketplace', label: 'Pazaryeri' },
            { key: 'readiness', label: 'Hazirlik' },
            { key: 'missing', label: 'Eksikler' },
            { key: 'status', label: 'Gonderim Durumu' },
          ]}
        />
      )}

      {activeTab === 'history' && (
        <DataTable
          rows={statusRows}
          columns={[
            { key: 'marketplace', label: 'Pazaryeri' },
            { key: 'status', label: 'Durum' },
            { key: 'last_sent_at', label: 'Son Gonderim' },
          ]}
        />
      )}

      {activeTab === 'errors' && (
        <DataTable
          rows={statusRows.filter((row) => row.error !== '-')}
          emptyTitle="API hatasi yok"
          emptyText="Bu urune ait pazaryeri hatasi bulunmuyor."
          columns={[
            { key: 'marketplace', label: 'Pazaryeri' },
            { key: 'error', label: 'Hata' },
          ]}
        />
      )}
    </>
  );
}
