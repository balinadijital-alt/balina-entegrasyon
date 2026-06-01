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
  ['errors', 'Pazaryeri Hatalari'],
];

const missingLabels = {
  category_mapping: 'Kategori eslesmesi',
  marketplace_category: 'Pazaryeri kategorisi',
  required_attributes: 'Zorunlu ozellik',
  attributes: 'Katalog niteligi',
  brand: 'Marka',
  category: 'Kategori',
  barcode: 'Barkod',
  sku: 'SKU',
  description: 'Aciklama',
  vat_rate: 'KDV',
  seo: 'SEO bilgileri',
  cargo: 'Kargo bilgisi',
  image: 'Gorsel',
  price: 'Fiyat',
  stock: 'Stok',
};

function missingText(fields = []) {
  return fields.map((field) => missingLabels[field] || field).join(', ');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function formatPrice(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function rollupStatusLabel(status) {
  return {
    not_ready: 'Eksik',
    ready: 'Hazir',
    queued: 'Kuyrukta',
    partial: 'Kismi',
    failed: 'Hatali',
    approved: 'Onayli',
    mixed: 'Karma',
  }[status] || status || '-';
}

function childMarketplaceStatus(product, code) {
  const status = product.marketplace_statuses?.find((item) => item.marketplace_code === code)
    || product.marketplaceStatuses?.find((item) => item.marketplace_code === code);

  return status?.status || status?.readiness_status || '-';
}

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
      missing: missingText(readiness?.marketplaces?.[code]?.missing_fields || []) || '-',
      last_sent_at: marketplaceStatus(product, code)?.last_sent_at || '-',
      error: marketplaceStatus(product, code)?.error_message || '-',
    }));
  }, [product, readiness]);

  if (loading && !product) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!product) return null;

  const image = productImage(product);
  const missing = missingFields(product);
  const childVariants = Array.isArray(product.variants) ? product.variants : [];
  const legacyVariants = Array.isArray(product.variant_options) ? product.variant_options : [];
  const readinessRollup = product.variant_readiness_rollup;
  const statusRollup = product.variant_marketplace_status_rollup || {};

  return (
    <>
      <PageHeader
        title="Urun Detay"
        actions={(
          <>
            <Link className="button-link secondary-link" to={`/products/${product.id}/edit`}><Edit3 size={16} /> Duzenle</Link>
            <Link className="button-link secondary-link" to={`/products/category-mapping?category=${encodeURIComponent(product.category || '')}`}><Layers3 size={16} /> Gonderime Hazirla</Link>
            <Link className="button-link secondary-link" to="/products/publish-queue">Aktarim Listesine Ekle</Link>
            <Link className="button-link" to={`/products/publish?product=${product.id}`}><Send size={16} /> Pazaryerine Gonder</Link>
          </>
        )}
      />

      {missing.length > 0 && (
        <section className="state-box workflow-warning">
          <AlertTriangle size={18} />
          <span>Eksik alanlar: {missingText(missing)}. Gonderimden once kategori eslesmesi ve zorunlu ozellikler tamamlanmali.</span>
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
            <div className="detail-card"><span>Hazirlik</span><strong>{readinessScore(product)}%</strong></div>
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
            <div className="detail-card"><span>Parent</span><strong>{product.parent?.sku || '-'}</strong></div>
            <div className="detail-card"><span>Varyant grubu</span><strong>{product.variant_group_key || product.variant_group || '-'}</strong></div>
          </div>
        </section>
      )}

      {activeTab === 'general' && (
        <section className="panel">
          <h2>Urun Kaynagi</h2>
          <div className="detail-grid">
            <div className="detail-card"><span>XML Source</span><strong>{product.xml_source?.name || '-'}</strong></div>
            <div className="detail-card"><span>Source product code</span><strong>{product.source_product_code || '-'}</strong></div>
            <div className="detail-card"><span>Last XML sync</span><strong>{formatDateTime(product.last_xml_sync_at)}</strong></div>
          </div>
        </section>
      )}

      {activeTab === 'general' && product.product_type === 'parent' && readinessRollup && (
        <section className="panel">
          <h2>Varyant Hazirlik Ozeti</h2>
          <div className="detail-grid">
            <div className="detail-card"><span>Child toplam</span><strong>{readinessRollup.total_children || 0}</strong></div>
            <div className="detail-card"><span>Hazir child</span><strong>{readinessRollup.ready_children || 0}</strong></div>
            <div className="detail-card"><span>Eksik child</span><strong>{readinessRollup.blocked_children || 0}</strong></div>
            <div className="detail-card"><span>Ortalama skor</span><strong>{readinessRollup.readiness_score || 0}%</strong></div>
            <div className="detail-card"><span>Trendyol</span><strong>{rollupStatusLabel(statusRollup.trendyol?.rollup_status)}</strong></div>
            <div className="detail-card"><span>Hepsiburada</span><strong>{rollupStatusLabel(statusRollup.hepsiburada?.rollup_status)}</strong></div>
          </div>
          <div className="soft-empty">
            <strong>Eksik alan ozeti</strong>
            <span>{Object.entries(readinessRollup.missing_fields_summary || {}).map(([field, count]) => `${missingLabels[field] || field}: ${count}`).join(', ') || 'Eksik yok'}</span>
          </div>
        </section>
      )}

      {activeTab === 'variants' && (
        <section className="panel">
          <h2>Varyantlar</h2>
          {product.parent ? (
            <div className="state-box">
              <span>Bu urun {product.parent.sku} parent urununun child varyantidir.</span>
            </div>
          ) : null}
          {childVariants.length > 0 ? (
            <DataTable
              rows={childVariants}
              emptyTitle="Child varyant yok"
              emptyText="Bu parent urune bagli child varyant bulunmuyor."
              columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'barcode', label: 'Barkod' },
                { key: 'name', label: 'Urun' },
                { key: 'stock', label: 'Stok' },
                { key: 'price', label: 'Fiyat', render: (row) => formatPrice(row.price) },
                { key: 'readiness', label: 'Hazirlik', render: (row) => `${readinessScore(row)}%` },
                { key: 'marketplace', label: 'Pazaryeri', render: (row) => `TY ${childMarketplaceStatus(row, 'trendyol')} / HB ${childMarketplaceStatus(row, 'hepsiburada')}` },
                { key: 'variant_attributes', label: 'Nitelikler', render: (row) => Object.entries(row.variant_attributes || {}).map(([key, value]) => `${key}: ${value}`).join(', ') || '-' },
                { key: 'status', label: 'Durum' },
              ]}
            />
          ) : legacyVariants.length === 0 ? (
            <div className="soft-empty">Bu urunde varyant bulunmuyor.</div>
          ) : (
            <div className="category-list">
              {legacyVariants.map((variant, index) => <span key={variant.sku || variant.name || index}>{variant.name || variant.sku || `Varyant ${index + 1}`}</span>)}
            </div>
          )}
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
          emptyTitle="Pazaryeri hatasi yok"
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
