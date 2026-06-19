import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import {
  isMarketplaceReady,
  marketplaceStatus,
  missingFields,
  missingLabel,
  missingTextFromFields,
  productImage,
  publishBlockReason,
  readinessScore,
} from './productWorkflow.js';

const TRENDYOL = 'trendyol';

const POOL_MODES = [
  { value: 'now', label: 'Hemen gönder' },
  { value: 'scheduled', label: 'Zamanla' },
  { value: 'draft', label: 'Taslak oluştur' },
];

const EMPTY_FILTERS = {
  query: '',
  category: '',
  brand: '',
  readiness: '',
  marketplaceStatus: '',
  onlyReady: false,
  onlyMissing: false,
};

function marketplaceName(code) {
  if (code === 'trendyol') return 'Trendyol';
  if (code === 'hepsiburada') return 'Hepsiburada';
  return 'Pazaryeri';
}

function draftMissingFields(draft) {
  return Object.values(draft?.readiness_report || {})
    .flatMap((item) => item?.missing_fields || [])
    .filter(Boolean);
}

function draftMissingText(draft) {
  return missingTextFromFields(draftMissingFields(draft));
}

function normalizeStatus(status) {
  if (status === 'ready') return 'queued';
  if (status === 'completed') return 'success';
  if (status === 'blocked') return 'rejected';
  return status || '-';
}

function friendlyDraftStatus(status) {
  const normalized = normalizeStatus(status);
  const labels = {
    draft: 'Hazırlanıyor',
    queued: 'Trendyol’a gönderildi',
    running: 'İşlemde',
    submitted: 'Trendyol inceliyor',
    processing: 'Trendyol inceliyor',
    partial_success: 'Kısmi başarılı',
    success: 'Başarılı',
    failed: 'Hatalı',
    rejected: 'Tekrar denenebilir',
    canceled: 'İptal edildi',
  };

  return labels[normalized] || normalized;
}

function friendlyProviderError(message = '') {
  const text = String(message || '').toLowerCase();

  if (text.includes('categoryattributevalueid') || text.includes('attribute') || text.includes('nitelik')) {
    return 'Zorunlu özellik değeri seçilmemiş.';
  }
  if (text.includes('brandid') || text.includes('brand')) {
    return 'Marka Trendyol ile eşleşmemiş.';
  }
  if (text.includes('barcode') && text.includes('exists')) {
    return 'Bu barkod Trendyol’da zaten kullanılıyor olabilir.';
  }
  if (text.includes('batch') && text.includes('not found')) {
    return 'Trendyol işlem sonucu henüz hazır değil.';
  }
  if (text.includes('category') || text.includes('kategori')) {
    return 'Kategori eşleşmesi geçersiz veya eksik.';
  }

  return message || 'İşlem için kontrol gerekiyor.';
}

function readinessType(product) {
  const missing = missingFields(product, TRENDYOL);

  if (isMarketplaceReady(product, TRENDYOL)) {
    return { key: 'ready', label: 'Hazır', tone: 'ready' };
  }
  if (missing.some((field) => ['category', 'marketplace_category', 'category_mapping'].includes(field))) {
    return { key: 'category', label: 'Kategori Eksik', tone: 'blocked' };
  }
  if (missing.some((field) => ['brand', 'brand_mapping'].includes(field))) {
    return { key: 'brand', label: 'Marka Eksik', tone: 'blocked' };
  }
  if (missing.some((field) => ['attributes', 'required_attributes', 'attribute_mappings'].includes(field))) {
    return { key: 'attribute', label: 'Özellik Eksik', tone: 'blocked' };
  }
  if (missing.some((field) => ['variant_attributes', 'variant_attribute_mappings'].includes(field))) {
    return { key: 'variant', label: 'Varyant Eksik', tone: 'blocked' };
  }
  if (missing.some((field) => ['stock', 'price'].includes(field))) {
    return { key: 'stock_price', label: 'Stok/Fiyat Eksik', tone: 'blocked' };
  }
  if (missing.includes('barcode')) {
    return { key: 'barcode', label: 'Barkod Sorunu', tone: 'blocked' };
  }

  return { key: 'missing', label: 'Eksik Bilgili', tone: 'blocked' };
}

function sendStatus(product) {
  const status = marketplaceStatus(product, TRENDYOL);
  const normalized = normalizeStatus(status?.status);

  if (!status) return { key: 'not_sent', label: 'Gönderilmedi', tone: 'neutral' };
  if (['queued', 'running', 'submitted', 'processing'].includes(normalized)) {
    return { key: 'processing', label: friendlyDraftStatus(normalized), tone: 'progress' };
  }
  if (normalized === 'success') return { key: 'success', label: 'Başarılı', tone: 'ready' };
  if (['failed', 'rejected', 'partial_success'].includes(normalized)) {
    return { key: 'error', label: friendlyDraftStatus(normalized), tone: 'blocked' };
  }

  return { key: normalized, label: friendlyDraftStatus(normalized), tone: 'neutral' };
}

function fixTarget(product, field) {
  if (field === 'category_mapping' || field === 'marketplace_category' || field === 'category') {
    return `/marketplace-mapping?step=categories&category_id=${encodeURIComponent(product.category || '')}`;
  }
  if (field === 'brand' || field === 'brand_mapping') {
    return `/marketplace-mapping?step=brands&brand=${encodeURIComponent(product.brand || '')}`;
  }
  if (field === 'attributes' || field === 'required_attributes' || field === 'attribute_mappings') {
    return `/marketplace-mapping?step=attributes&category_id=${encodeURIComponent(product.trendyol_category_id || product.category || '')}`;
  }
  if (field === 'variant_attributes' || field === 'variant_attribute_mappings') {
    return `/marketplace-mapping?step=variants&category_id=${encodeURIComponent(product.trendyol_category_id || product.category || '')}`;
  }

  return `/products/${product.id}/edit`;
}

function missingAdvice(field) {
  const advice = {
    category: 'Bu ürün için kategori bilgisi eksik.',
    marketplace_category: 'Bu ürün için Trendyol kategorisi seçilmemiş.',
    category_mapping: 'Bu ürünün iç kategorisi Trendyol kategorisiyle eşleşmemiş.',
    brand: 'Bu ürünün marka bilgisi eksik.',
    brand_mapping: 'Bu ürünün markası Trendyol marka listesiyle eşleşmemiş.',
    attributes: 'Bu ürünün katalog özellikleri eksik.',
    required_attributes: 'Bu kategori için zorunlu özelliklerden bazıları eksik.',
    attribute_mappings: 'Zorunlu özellik eşleşmesi tamamlanmamış.',
    variant_attributes: 'Varyant değerleri eksik.',
    variant_attribute_mappings: 'Renk, beden veya boyut gibi varyant eşleşmeleri tamamlanmamış.',
    barcode: 'Barkod Trendyol’a gönderim için uygun değil veya eksik.',
    stock: 'Stok bilgisi gönderim için uygun değil.',
    price: 'Fiyat bilgisi gönderim için uygun değil.',
    image: 'Ürün görseli eksik.',
    cargo: 'Kargo veya desi bilgisi eksik.',
    seo: 'SEO başlığı veya açıklaması eksik.',
    description: 'Ürün açıklaması eksik.',
  };

  return advice[field] || `${missingLabel(field)} tamamlanmalı.`;
}

function productMatchesQuery(product, query) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return [product.name, product.sku, product.barcode, product.category, product.brand]
    .some((value) => String(value || '').toLowerCase().includes(needle));
}

function productMatchesFilters(product, filters) {
  const type = readinessType(product);
  const status = sendStatus(product);

  if (!productMatchesQuery(product, filters.query)) return false;
  if (filters.category && product.category !== filters.category) return false;
  if (filters.brand && product.brand !== filters.brand) return false;
  if (filters.readiness && type.key !== filters.readiness) return false;
  if (filters.marketplaceStatus && status.key !== filters.marketplaceStatus) return false;
  if (filters.onlyReady && type.key !== 'ready') return false;
  if (filters.onlyMissing && type.key === 'ready') return false;

  return true;
}

function productIdsFromDraft(draft) {
  return Array.isArray(draft?.product_ids) ? draft.product_ids : [];
}

export function ProductPublishWizardPage() {
  const [searchParams] = useSearchParams();
  const { notify, user } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [products, setProducts] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [poolIds, setPoolIds] = useState([]);
  const [marketplaceId, setMarketplaceId] = useState('');
  const [poolMode, setPoolMode] = useState('now');
  const [draftName, setDraftName] = useState('Trendyol ürün gönderimi');
  const [confirmContext, setConfirmContext] = useState(null);
  const [drawerProduct, setDrawerProduct] = useState(null);
  const [historyDraft, setHistoryDraft] = useState(null);

  const canSendMarketplaces = hasPermission(user, 'marketplaces.send');
  const trendyolAccounts = useMemo(() => marketplaces.filter((item) => item.code === TRENDYOL), [marketplaces]);
  const selectedMarketplace = useMemo(
    () => trendyolAccounts.find((item) => String(item.id) === String(marketplaceId)),
    [trendyolAccounts, marketplaceId],
  );
  const apiVerified = selectedMarketplace?.connection_status === 'connected' && selectedMarketplace?.is_active !== false;

  const nonParentProducts = useMemo(() => products.filter((product) => product.product_type !== 'parent'), [products]);
  const visibleProducts = useMemo(
    () => nonParentProducts.filter((product) => productMatchesFilters(product, filters)),
    [nonParentProducts, filters],
  );
  const poolProducts = useMemo(
    () => nonParentProducts.filter((product) => poolIds.includes(product.id)),
    [nonParentProducts, poolIds],
  );
  const selectedProducts = useMemo(
    () => nonParentProducts.filter((product) => selectedIds.includes(product.id)),
    [nonParentProducts, selectedIds],
  );
  const poolReadyProducts = useMemo(() => poolProducts.filter((product) => isMarketplaceReady(product, TRENDYOL)), [poolProducts]);
  const poolBlockedProducts = useMemo(() => poolProducts.filter((product) => !isMarketplaceReady(product, TRENDYOL)), [poolProducts]);
  const blockedProducts = useMemo(() => nonParentProducts.filter((product) => !isMarketplaceReady(product, TRENDYOL)), [nonParentProducts]);
  const readyProducts = useMemo(() => nonParentProducts.filter((product) => isMarketplaceReady(product, TRENDYOL)), [nonParentProducts]);
  const categories = useMemo(() => [...new Set(nonParentProducts.map((product) => product.category).filter(Boolean))].sort(), [nonParentProducts]);
  const brands = useMemo(() => [...new Set(nonParentProducts.map((product) => product.brand).filter(Boolean))].sort(), [nonParentProducts]);

  const statusCounts = useMemo(() => {
    const counts = {
      ready: 0,
      missing: 0,
      processing: 0,
      success: 0,
      error: 0,
    };

    nonParentProducts.forEach((product) => {
      if (isMarketplaceReady(product, TRENDYOL)) counts.ready += 1;
      else counts.missing += 1;

      const status = sendStatus(product).key;
      if (status === 'processing') counts.processing += 1;
      if (status === 'success') counts.success += 1;
      if (status === 'error') counts.error += 1;
    });

    return counts;
  }, [nonParentProducts]);

  const filteredDrafts = useMemo(
    () => drafts
      .filter((draft) => draft.marketplace_code === TRENDYOL)
      .slice()
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    [drafts],
  );

  const load = async () => {
    await run(async () => {
      const [productResponse, marketplaceResponse, draftResponse] = await Promise.all([
        api.products.list(),
        api.marketplaces.list(),
        api.productPublish.drafts(),
      ]);
      const productItems = productResponse.data || [];
      const marketplaceItems = marketplaceResponse.data || [];

      setProducts(productItems);
      setMarketplaces(marketplaceItems);
      setDrafts(draftResponse.data || []);

      const firstTrendyol = marketplaceItems.find((item) => item.code === TRENDYOL);
      setMarketplaceId((current) => current || firstTrendyol?.id || '');

      const productId = Number(searchParams.get('product'));
      if (productId && productItems.some((product) => Number(product.id) === productId)) {
        setSelectedIds([productId]);
        setPoolIds([productId]);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSelected = (id) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleVisible = () => {
    const ids = visibleProducts.map((product) => product.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => (allSelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  };

  const addSelectedToPool = () => {
    if (selectedIds.length === 0) {
      notify('error', 'Gönderim havuzuna eklemek için ürün seçin.');
      return;
    }
    const newIds = selectedIds.filter((id) => !poolIds.includes(id));
    if (newIds.length === 0) {
      notify('error', 'Seçili ürünler zaten gönderim havuzunda.');
      return;
    }
    setPoolIds((current) => [...new Set([...current, ...newIds])]);
    notify('success', `${newIds.length} ürün gönderim havuzuna eklendi.`);
  };

  const removeFromPool = (id) => {
    setPoolIds((current) => current.filter((item) => item !== id));
  };

  const resetFilters = () => setFilters(EMPTY_FILTERS);

  const refreshProductReadiness = async (productId) => {
    await run(async () => {
      await api.products.readiness(productId);
      await load();
      notify('success', 'Hazırlık kontrolü yenilendi.');
    }, { onError: (message) => notify('error', message) });
  };

  const startSingleSend = (product) => {
    if (isMarketplaceReady(product, TRENDYOL)) {
      setPoolIds([product.id]);
      setConfirmContext({ type: 'single', products: [product] });
      return;
    }

    setDrawerProduct(product);
  };

  const startPoolSend = () => {
    if (poolProducts.length === 0) {
      notify('error', 'Gönderim başlatmak için havuza ürün ekleyin.');
      return;
    }

    setConfirmContext({ type: 'pool', products: poolProducts });
  };

  const validateAndMaybeSend = async (context) => {
    if (!canSendMarketplaces) return;
    if (!selectedMarketplace) {
      setError('Trendyol mağazası seçilmelidir.');
      return;
    }
    if (!apiVerified) {
      setError('API doğrulanmadan ürün gönderme işlemi oluşturulamaz. Önce Trendyol entegrasyonunda bağlantıyı test edin.');
      return;
    }

    const readyIds = context.products
      .filter((product) => isMarketplaceReady(product, TRENDYOL))
      .map((product) => product.id);

    if (readyIds.length === 0) {
      setError('Seçili ürünlerde gönderime hazır ürün yok. Eksikleri tamamlayıp tekrar deneyin.');
      return;
    }

    await run(async () => {
      const payload = {
        marketplace_account_id: marketplaceId,
        product_ids: readyIds,
        operation_name: context.type === 'single' ? `Tekli gönderim - ${context.products[0]?.sku || context.products[0]?.id}` : draftName,
        operation_type: 'product_send',
        schedule: poolMode === 'scheduled' ? 'manual' : poolMode,
        operation_filters: {
          source: context.type === 'single' ? 'single_product' : 'publish_pool',
          requested_product_count: context.products.length,
          ready_product_count: readyIds.length,
          blocked_product_count: context.products.length - readyIds.length,
          mode: poolMode,
        },
        mappings: {},
        price_controls: { source: 'trendyol-publish-pool' },
      };

      const draft = await api.productPublish.validate(payload);
      let result = draft;

      if (poolMode === 'now' && draft.status !== 'blocked') {
        result = await api.productPublish.send(draft.id);
        notify('success', 'Hazır ürünler Trendyol gönderim kuyruğuna alındı.');
      } else if (draft.status === 'blocked') {
        notify('error', 'Bazı ürünlerde eksik bilgi var. Hazır ürünler dışında gönderim yapılmadı.');
      } else {
        notify('success', poolMode === 'draft' ? 'Taslak oluşturuldu.' : 'Zamanlı gönderim taslağı oluşturuldu.');
      }

      setHistoryDraft(result);
      setConfirmContext(null);
      setPoolIds((current) => current.filter((id) => !readyIds.includes(id)));
      setSelectedIds([]);
      await load();
    }, { onError: (message) => notify('error', friendlyProviderError(message)) });
  };

  const poolWarning = poolBlockedProducts.length > 0
    ? `Seçili ürünlerden ${poolBlockedProducts.length} tanesi eksik bilgi nedeniyle gönderilemeyecek. Sadece hazır olan ${poolReadyProducts.length} ürün gönderilecek.`
    : 'Havuzdaki tüm ürünler gönderime hazır.';
  const poolDisabledReason = !canSendMarketplaces
    ? 'Bu işlem için pazaryerine gönderim yetkisi gerekir.'
    : !apiVerified
      ? 'Gönderim başlatmak için önce Trendyol API bağlantısını test edin.'
      : poolProducts.length === 0
        ? 'Ürün seçip gönderim havuzuna ekleyin.'
        : poolReadyProducts.length === 0
          ? 'Havuzdaki ürünlerde eksikler var. En az bir hazır ürün gerekir.'
          : '';

  return (
    <>
      <PageHeader
        title="Trendyol Ürün Gönderimi"
        description="Ürünlerinizi Trendyol’a göndermeden önce hazırlık durumunu kontrol edin, eksikleri tamamlayın ve seçili ürünleri işlem havuzuna ekleyerek gönderimi başlatın."
        actions={(
          <button type="button" onClick={addSelectedToPool}>
            <PackagePlus size={16} /> Ürünleri Gönderim Havuzuna Ekle
          </button>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && products.length === 0 ? <LoadingState /> : null}

      <section className="marketplace-module-tabs">
        <Link to="/marketplaces">Entegrasyonlar</Link>
        <Link className="active" to="/products/publish-wizard">Trendyol Ürün Gönderimi</Link>
        <Link to="/marketplace-mapping">Eşleştirme Merkezi</Link>
        <Link to="/products/publish-queue">Pazaryeri Monitörü</Link>
      </section>

      <section className="trendyol-pool-hero">
        <div>
          <span><ShoppingBag size={16} /> Pazaryerleri / Trendyol / Ürün Gönderimi</span>
          <h2>Ürünleri seç, havuza al, hazır olanları gönder</h2>
          <p>Eksik ürünleri teknik hata metinleriyle boğmadan gösterir; hazır ürünler aynı akışta Trendyol kuyruğuna alınır.</p>
        </div>
        <div className="trendyol-pool-account">
          <label>
            <span>Trendyol mağazası</span>
            <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
              <option value="">Mağaza seçin</option>
              {trendyolAccounts.map((account) => (
                <option value={account.id} key={account.id}>{account.name}</option>
              ))}
            </select>
          </label>
          <small className={apiVerified ? 'ready' : 'blocked'}>{apiVerified ? 'API bağlantısı doğrulandı' : 'API testi gerekli'}</small>
        </div>
      </section>

      <section className="trendyol-status-grid">
        {[
          ['ready', 'Gönderime Hazır', statusCounts.ready, 'ready'],
          ['missing', 'Eksik Bilgili', statusCounts.missing, 'blocked'],
          ['processing', 'İşlemde', statusCounts.processing, 'progress'],
          ['success', 'Başarılı', statusCounts.success, 'ready'],
          ['error', 'Hatalı', statusCounts.error, 'blocked'],
        ].map(([key, label, count, tone]) => (
          <button
            type="button"
            className={filters.readiness === key || filters.marketplaceStatus === key ? `active ${tone}` : tone}
            key={key}
            onClick={() => {
              if (key === 'ready') setFilters((current) => ({ ...current, readiness: current.readiness === 'ready' ? '' : 'ready', marketplaceStatus: '' }));
              else if (key === 'missing') setFilters((current) => ({ ...current, readiness: current.readiness === 'missing' ? '' : 'missing', marketplaceStatus: '' }));
              else setFilters((current) => ({ ...current, marketplaceStatus: current.marketplaceStatus === key ? '' : key, readiness: '' }));
            }}
          >
            <span>{label}</span>
            <strong>{count}</strong>
          </button>
        ))}
      </section>

      <section className="trendyol-publish-layout">
        <main className="trendyol-product-panel">
          <header className="trendyol-filter-bar">
            <label className="resource-search">
              <Search size={16} />
              <input
                value={filters.query}
                onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
                placeholder="Ürün adı, SKU veya barkod ara"
              />
            </label>
            <select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>
              <option value="">Tüm kategoriler</option>
              {categories.map((category) => <option value={category} key={category}>{category}</option>)}
            </select>
            <select value={filters.brand} onChange={(event) => setFilters((current) => ({ ...current, brand: event.target.value }))}>
              <option value="">Tüm markalar</option>
              {brands.map((brand) => <option value={brand} key={brand}>{brand}</option>)}
            </select>
            <select value={filters.readiness} onChange={(event) => setFilters((current) => ({ ...current, readiness: event.target.value }))}>
              <option value="">Hazırlık durumu</option>
              <option value="ready">Hazır</option>
              <option value="category">Kategori Eksik</option>
              <option value="brand">Marka Eksik</option>
              <option value="attribute">Özellik Eksik</option>
              <option value="variant">Varyant Eksik</option>
              <option value="stock_price">Stok/Fiyat Eksik</option>
              <option value="barcode">Barkod Sorunu</option>
              <option value="missing">Eksik Bilgili</option>
            </select>
            <select value={filters.marketplaceStatus} onChange={(event) => setFilters((current) => ({ ...current, marketplaceStatus: event.target.value }))}>
              <option value="">Trendyol durumu</option>
              <option value="not_sent">Gönderilmedi</option>
              <option value="processing">İşlemde</option>
              <option value="success">Başarılı</option>
              <option value="error">Hatalı</option>
            </select>
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={filters.onlyReady}
                onChange={(event) => setFilters((current) => ({ ...current, onlyReady: event.target.checked, onlyMissing: event.target.checked ? false : current.onlyMissing }))}
              />
              <span>Sadece hazır</span>
            </label>
            <label className="toggle-line">
              <input
                type="checkbox"
                checked={filters.onlyMissing}
                onChange={(event) => setFilters((current) => ({ ...current, onlyMissing: event.target.checked, onlyReady: event.target.checked ? false : current.onlyReady }))}
              />
              <span>Sadece eksikli</span>
            </label>
            <button type="button" className="secondary-button" onClick={resetFilters}><Filter size={16} /> Temizle</button>
          </header>

          <div className="trendyol-mobile-summary">
            <strong>{visibleProducts.length} ürün listeleniyor</strong>
            <span>{selectedIds.length} seçili, {poolIds.length} havuzda</span>
          </div>

          <div className="trendyol-product-table">
            <table>
              <thead>
                <tr>
                  <th><input type="checkbox" checked={visibleProducts.length > 0 && visibleProducts.every((product) => selectedIds.includes(product.id))} onChange={toggleVisible} /></th>
                  <th>Ürün</th>
                  <th>SKU</th>
                  <th>Barkod</th>
                  <th>Kategori</th>
                  <th>Marka</th>
                  <th>Stok</th>
                  <th>Fiyat</th>
                  <th>Hazırlık</th>
                  <th>Son Durum</th>
                  <th>Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {visibleProducts.length === 0 ? (
                  <tr>
                    <td colSpan={11}>
                      <div className="empty-state">
                        <PackageCheck size={28} />
                        <strong>Gönderime uygun ürün bulunamadı.</strong>
                        <span>Önce kategori, marka ve zorunlu özellik eşleşmelerini tamamlayın.</span>
                      </div>
                    </td>
                  </tr>
                ) : visibleProducts.map((product) => {
                  const ready = isMarketplaceReady(product, TRENDYOL);
                  const readiness = readinessType(product);
                  const status = sendStatus(product);
                  const image = productImage(product);

                  return (
                    <tr key={product.id}>
                      <td data-label="Seç">
                        <input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} />
                      </td>
                      <td data-label="Ürün">
                        <div className="trendyol-product-cell">
                          <div className="trendyol-product-thumb">{image ? <img src={image} alt="" /> : <PackageCheck size={18} />}</div>
                          <div>
                            <strong>{product.name}</strong>
                            <small>{readinessScore(product, TRENDYOL)} hazırlık puanı</small>
                          </div>
                        </div>
                      </td>
                      <td data-label="SKU">{product.sku || '-'}</td>
                      <td data-label="Barkod">{product.barcode || '-'}</td>
                      <td data-label="Kategori">{product.category || '-'}</td>
                      <td data-label="Marka">{product.brand || '-'}</td>
                      <td data-label="Stok">{product.stock ?? '-'}</td>
                      <td data-label="Fiyat">{product.price ? `${product.price} TL` : '-'}</td>
                      <td data-label="Hazırlık"><span className={`pool-badge ${readiness.tone}`}>{readiness.label}</span></td>
                      <td data-label="Son Durum"><span className={`pool-badge ${status.tone}`}>{status.label}</span></td>
                      <td data-label="Aksiyon">
                        <div className="row-actions">
                          <button type="button" className="secondary-button" onClick={() => startSingleSend(product)}>
                            {ready ? <Send size={14} /> : <AlertTriangle size={14} />}
                            {ready ? 'Gönder' : 'Eksikleri Tamamla'}
                          </button>
                          <button type="button" className="secondary-button" onClick={() => setDrawerProduct(product)}><Eye size={14} /> Detay</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </main>

        <aside className="trendyol-pool-panel">
          <div className="trendyol-pool-sticky">
            <header>
              <span>Gönderim Havuzu</span>
              <strong>{poolProducts.length} ürün seçildi</strong>
            </header>
            <div className="trendyol-pool-metrics">
              <div><span>Hazır</span><strong>{poolReadyProducts.length}</strong></div>
              <div><span>Eksik</span><strong>{poolBlockedProducts.length}</strong></div>
              <div><span>Gönderilemez</span><strong>{poolBlockedProducts.length}</strong></div>
            </div>
            <label>
              <span>Marketplace account</span>
              <select value={marketplaceId} onChange={(event) => setMarketplaceId(event.target.value)}>
                <option value="">Trendyol mağazası seçin</option>
                {trendyolAccounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label>
              <span>Gönderim tipi</span>
              <select value={poolMode} onChange={(event) => setPoolMode(event.target.value)}>
                {POOL_MODES.map((mode) => <option value={mode.value} key={mode.value}>{mode.label}</option>)}
              </select>
            </label>
            <label>
              <span>Gönderim adı</span>
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} />
            </label>
            <div className={poolBlockedProducts.length > 0 ? 'pool-warning' : 'pool-success'}>
              {poolBlockedProducts.length > 0 ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
              <span>{poolWarning}</span>
            </div>
            <div className="trendyol-pool-list">
              {poolProducts.length === 0 ? (
                <div className="soft-empty">Seçili ürün yok. Gönderim başlatmak için listeden ürün seçin.</div>
              ) : poolProducts.slice(0, 6).map((product) => (
                <div key={product.id}>
                  <span>{product.sku}</span>
                  <strong>{product.name}</strong>
                  <button type="button" onClick={() => removeFromPool(product.id)}><X size={14} /></button>
                </div>
              ))}
              {poolProducts.length > 6 && <small>+{poolProducts.length - 6} ürün daha</small>}
            </div>
            <button type="button" disabled={loading || !canSendMarketplaces || poolReadyProducts.length === 0 || !apiVerified} onClick={startPoolSend}>
              <Send size={16} /> Trendyol’a Gönderimi Başlat
            </button>
            {poolDisabledReason && <small className="pool-disabled-reason">{poolDisabledReason}</small>}
            {poolBlockedProducts.length > 0 && (
              <button type="button" className="secondary-button" onClick={() => setDrawerProduct(poolBlockedProducts[0])}>
                Eksikleri Gör
              </button>
            )}
            {!apiVerified && (
              <Link className="table-action-link" to="/marketplaces/trendyol">Önce API bağlantısını test et</Link>
            )}
          </div>
        </aside>
      </section>

      <section className="trendyol-history-panel">
        <header>
          <div>
            <span>İşlem Geçmişi</span>
            <h2>Son Gönderimler</h2>
          </div>
          <button type="button" className="secondary-button" onClick={load}><RefreshCw size={16} /> Yenile</button>
        </header>
        <div className="trendyol-history-table">
          <table>
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Gönderim adı</th>
                <th>Ürün sayısı</th>
                <th>Batch ID</th>
                <th>Durum</th>
                <th>Detay</th>
              </tr>
            </thead>
            <tbody>
              {filteredDrafts.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Clock3 size={26} />
                      <strong>Henüz gönderim geçmişi oluşmadı.</strong>
                      <span>Gönderim başlatıldığında sonuçlar burada görünecek.</span>
                    </div>
                  </td>
                </tr>
              ) : filteredDrafts.slice(0, 8).map((draft) => {
                const productCount = productIdsFromDraft(draft).length;
                const batchId = draft.batch_request_id || draft.result_summary?.batch_request_id;
                return (
                  <tr key={draft.id}>
                    <td>{draft.created_at ? new Date(draft.created_at).toLocaleString('tr-TR') : '-'}</td>
                    <td>{draft.operation_name || draft.result_summary?.name || `Gönderim #${draft.id}`}</td>
                    <td>{productCount || '-'}</td>
                    <td>{batchId || '-'}</td>
                    <td><span className={`pool-badge ${['failed', 'blocked', 'rejected'].includes(draft.status) ? 'blocked' : 'progress'}`}>{friendlyDraftStatus(draft.status)}</span></td>
                    <td><button type="button" className="secondary-button" onClick={() => setHistoryDraft(draft)}>Detay</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {drawerProduct && (
        <aside className="pool-drawer-backdrop" onClick={() => setDrawerProduct(null)}>
          <div className="pool-drawer" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Eksikleri Tamamla</span>
                <h2>{drawerProduct.name}</h2>
                <p>SKU {drawerProduct.sku || '-'} / Barkod {drawerProduct.barcode || '-'}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setDrawerProduct(null)}><X size={18} /></button>
            </header>
            <section className="pool-drawer-summary">
              <div><span>Kategori</span><strong>{drawerProduct.category || '-'}</strong></div>
              <div><span>Trendyol kategori</span><strong>{drawerProduct.trendyol_category_id || '-'}</strong></div>
              <div><span>Marka</span><strong>{drawerProduct.brand || '-'}</strong></div>
              <div><span>Stok/Fiyat</span><strong>{drawerProduct.stock ?? '-'} / {drawerProduct.price || '-'}</strong></div>
            </section>
            <section className="pool-missing-list">
              {missingFields(drawerProduct, TRENDYOL).length === 0 ? (
                <div className="pool-success"><CheckCircle2 size={17} /> <span>Bu ürün gönderime hazır görünüyor.</span></div>
              ) : missingFields(drawerProduct, TRENDYOL).map((field) => (
                <div key={field}>
                  <AlertTriangle size={17} />
                  <div>
                    <strong>{missingLabel(field)}</strong>
                    <span>{missingAdvice(field)}</span>
                    <Link className="table-action-link" to={fixTarget(drawerProduct, field)}>İlgili alana git <ArrowRight size={13} /></Link>
                  </div>
                </div>
              ))}
            </section>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setDrawerProduct(null)}>Vazgeç</button>
              <Link className="button-link secondary-link" to={`/products/${drawerProduct.id}/edit`}>Kaydet</Link>
              <button type="button" onClick={() => refreshProductReadiness(drawerProduct.id)}><RefreshCw size={16} /> Kaydet ve Hazırlık Kontrolü Yap</button>
            </footer>
          </div>
        </aside>
      )}

      {confirmContext && (
        <div className="workflow-modal-backdrop" role="presentation">
          <div className="workflow-modal pool-confirm-modal">
            <header className="workflow-modal-header">
              <div>
                <span>Gönderim Öncesi Onay</span>
                <h2>Trendyol gönderimi başlatılsın mı?</h2>
                <p>Gönderim başlatıldıktan sonra sonucu İşlem Geçmişi alanından takip edebilirsiniz.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setConfirmContext(null)}><X size={18} /></button>
            </header>
            <section className="publish-summary-grid">
              <div><span>Seçilen ürün</span><strong>{confirmContext.products.length}</strong></div>
              <div><span>Gönderime hazır</span><strong>{confirmContext.products.filter((product) => isMarketplaceReady(product, TRENDYOL)).length}</strong></div>
              <div><span>Eksik nedeniyle gönderilmeyecek</span><strong>{confirmContext.products.filter((product) => !isMarketplaceReady(product, TRENDYOL)).length}</strong></div>
            </section>
            <div className="workflow-modal-warning">
              <AlertTriangle size={17} />
              <span>{confirmContext.products.some((product) => !isMarketplaceReady(product, TRENDYOL)) ? poolWarning : 'Tüm seçili ürünler Trendyol kuyruğuna alınmaya hazır.'}</span>
            </div>
            <div className="wizard-actions">
              <button type="button" className="secondary-button" onClick={() => setConfirmContext(null)}>Vazgeç</button>
              <button type="button" disabled={loading} onClick={() => validateAndMaybeSend(confirmContext)}>
                <Send size={16} /> Gönderimi Başlat
              </button>
            </div>
          </div>
        </div>
      )}

      {historyDraft && (
        <aside className="pool-drawer-backdrop" onClick={() => setHistoryDraft(null)}>
          <div className="pool-drawer" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>Batch Detayı</span>
                <h2>{historyDraft.operation_name || `Gönderim #${historyDraft.id}`}</h2>
                <p>Batch ID: {historyDraft.batch_request_id || historyDraft.result_summary?.batch_request_id || '-'}</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setHistoryDraft(null)}><X size={18} /></button>
            </header>
            <section className="pool-drawer-summary">
              <div><span>Durum</span><strong>{friendlyDraftStatus(historyDraft.status)}</strong></div>
              <div><span>Ürün sayısı</span><strong>{productIdsFromDraft(historyDraft).length || '-'}</strong></div>
              <div><span>Eksik alan</span><strong>{draftMissingText(historyDraft) || 'Yok'}</strong></div>
            </section>
            <section className="pool-missing-list">
              {(historyDraft.result_summary?.summary?.items || []).slice(0, 12).map((item, index) => (
                <div key={`${item.sku || item.barcode || index}`}>
                  {item.status === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
                  <div>
                    <strong>{item.sku || item.barcode || `Satır ${index + 1}`} - {item.status}</strong>
                    <span>{friendlyProviderError(item.message || item.error_message || item.error_code)}</span>
                    {(item.message || item.error_message || item.error_code) && (
                      <details>
                        <summary>Geliştirici Detayı</summary>
                        <code>{item.error_code || ''} {item.message || item.error_message || ''}</code>
                      </details>
                    )}
                  </div>
                </div>
              ))}
              {(historyDraft.result_summary?.summary?.items || []).length === 0 && (
                <div><Clock3 size={17} /><div><strong>Batch detayı bekleniyor</strong><span>Trendyol işlem sonucu hazır olduğunda burada listelenir.</span></div></div>
              )}
            </section>
            <footer>
              <button type="button" className="secondary-button" onClick={() => setHistoryDraft(null)}>Kapat</button>
              <button type="button" onClick={() => api.productPublish.batchResult(historyDraft.id).then((response) => { setHistoryDraft(response); load(); notify('success', 'Batch sonucu güncellendi.'); }).catch((err) => notify('error', friendlyProviderError(err.message)))}>
                <RefreshCw size={16} /> Batch sonucunu güncelle
              </button>
            </footer>
          </div>
        </aside>
      )}
    </>
  );
}
