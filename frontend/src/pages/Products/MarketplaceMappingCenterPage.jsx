import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Layers3, PackageCheck, RefreshCw, Save, Search, Send, ShieldCheck, SlidersHorizontal, Tags, Trash2, X } from 'lucide-react';
import { api, apiErrorMessage, asArray } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const tabs = [
  { key: 'categories', label: 'Kategori', icon: Layers3 },
  { key: 'brands', label: 'Marka', icon: ShieldCheck },
  { key: 'attributes', label: 'Ozellik / Nitelik', icon: ClipboardCheck },
  { key: 'variants', label: 'Varyant', icon: Tags },
  { key: 'readiness', label: 'Eksikler / Hazirlik', icon: AlertTriangle },
];

const statusOptions = ['active', 'passive', 'draft'];
const sourceTypes = ['product_field', 'variant_field', 'fixed_value', 'custom_json'];
const variantKeys = ['renk', 'beden', 'numara', 'desen', 'cinsiyet'];
const workflowStepMap = {
  category: 'categories',
  categories: 'categories',
  brand: 'brands',
  brands: 'brands',
  brand_mapping: 'brands',
  attribute: 'attributes',
  attributes: 'attributes',
  variant: 'variants',
  variants: 'variants',
  readiness: 'readiness',
};

const pageCopy = {
  categories: {
    title: 'Kategori Eslestirme',
    description: 'Ic kategorileri pazaryeri kategori karsiliklariyla eslestirin; nitelik akisi bu eslesmeden beslenir.',
    nextLabel: 'Nitelik eslestirmeye gec',
    nextPath: '/marketplace-mapping/attributes',
  },
  brands: {
    title: 'Marka Eslestirme',
    description: 'Ic markalari Trendyol ve Hepsiburada marka karsiliklariyla sade bir tabloda yonetin.',
    nextLabel: 'Hazirlik merkezine don',
    nextPath: '/marketplace-readiness',
  },
  attributes: {
    title: 'Ozellik / Nitelik Eslestirme',
    description: 'Kategori bazli zorunlu ve opsiyonel niteliklerin urun, varyant veya sabit deger kaynaklarini tanimlayin.',
    nextLabel: 'Varyant eslestirmeye gec',
    nextPath: '/marketplace-mapping/variants',
  },
  variants: {
    title: 'Varyant Eslestirme',
    description: 'Renk, beden, numara, desen ve cinsiyet gibi varyant anahtarlarini pazaryeri attribute alanlarina baglayin.',
    nextLabel: 'Hazirlik merkezine don',
    nextPath: '/marketplace-readiness',
  },
  readiness: {
    title: 'Pazaryeri Hazirlik Merkezi',
    description: 'Urun gondermeden once kategori, marka, nitelik ve varyant eksiklerini tek bakista gorun.',
    nextLabel: 'Hazir urunleri gonder',
    nextPath: '/products/publish-wizard',
  },
};

const emptyForms = {
  categories: {
    company_id: '',
    marketplace_code: 'trendyol',
    local_category_id: '',
    local_category_name: '',
    marketplace_category_id: '',
    marketplace_category_name: '',
    marketplace_category_path: '',
    confidence: '',
    status: 'active',
    metadata: {},
  },
  brands: {
    company_id: '',
    marketplace_code: 'trendyol',
    local_brand_id: '',
    local_brand_name: '',
    marketplace_brand_id: '',
    marketplace_brand_name: '',
    confidence: '',
    status: 'active',
    metadata: {},
  },
  attributes: {
    company_id: '',
    marketplace_code: 'trendyol',
    local_category_id: '',
    marketplace_category_id: '',
    marketplace_attribute_id: '',
    marketplace_attribute_name: '',
    required: false,
    value_type: '',
    source_type: 'product_field',
    source_field: '',
    fixed_value: '',
    value_map: {},
    status: 'active',
    metadata: {},
  },
  variants: {
    company_id: '',
    marketplace_code: 'trendyol',
    variant_key: 'renk',
    marketplace_attribute_id: '',
    marketplace_attribute_name: '',
    source_type: 'variant_field',
    source_field: '',
    value_map: {},
    status: 'active',
    metadata: {},
  },
};

function normalize(value) {
  return String(value || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function suggestionFor(value, candidates) {
  const source = normalize(value);
  if (!source) return null;
  const exact = candidates.find((candidate) => normalize(candidate.name) === source);
  if (exact) return { ...exact, confidence: 'exact' };
  const contains = candidates.find((candidate) => normalize(candidate.name).includes(source) || source.includes(normalize(candidate.name)));
  return contains ? { ...contains, confidence: 'contains' } : null;
}

function parseJson(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function jsonText(value) {
  if (!value || Object.keys(value).length === 0) return '';
  return JSON.stringify(value, null, 2);
}

function latestSyncedAt(items = []) {
  return items
    .map((item) => item.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

function formatCacheDate(value) {
  if (!value) return 'Henuz yok';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function mappingStatusLabel(value) {
  if (value === 'active') return 'Aktif';
  if (value === 'passive') return 'Pasif';
  if (value === 'draft') return 'Taslak';
  return value || '-';
}

function readinessReason(row) {
  const labels = {
    category_mapping: 'Kategori eslesmesi',
    brand_mapping: 'Marka eslesmesi',
    required_attributes: 'Zorunlu nitelik',
    variant_attributes: 'Varyant niteligi',
  };

  return (row.reasons || []).map((item) => labels[item] || item).join(', ') || 'Eksik yok';
}

function readinessFixLinks(row) {
  const links = [];
  if (row?.missing_category_mapping) links.push({ to: `/marketplace-mapping/categories?category=${encodeURIComponent(row.category || '')}`, label: 'Kategori mapping' });
  if (row?.missing_brand_mapping) links.push({ to: `/marketplace-mapping/brands?brand=${encodeURIComponent(row.brand || '')}`, label: 'Marka mapping' });
  if ((row?.missing_required_attributes || []).length > 0) links.push({ to: '/marketplace-mapping/attributes', label: 'Nitelik mapping' });
  if ((row?.missing_variant_attributes || []).length > 0) links.push({ to: '/marketplace-mapping/variants', label: 'Varyant mapping' });
  return links;
}

function countBy(items, predicate) {
  return items.filter(predicate).length;
}

function isMappedCategory(row) {
  return Boolean(row?.marketplace_category_id || row?.marketplace_category_name || row?.marketplace_category_path);
}

function stepStatusLabel(status) {
  if (status === 'complete') return 'Tamamlandi';
  if (status === 'missing') return 'Eksik';
  return 'Bekliyor';
}

function stepStatusClass(status) {
  if (status === 'complete') return 'ready';
  if (status === 'missing') return 'blocked';
  return 'pending';
}

function sourceTypeLabel(value) {
  if (value === 'product_field') return 'Urun alanindan';
  if (value === 'variant_field') return 'Varyant alanindan';
  if (value === 'fixed_value') return 'Sabit deger';
  if (value === 'custom_json') return 'Custom JSON';
  return value || '-';
}

function variantLabel(value) {
  const labels = { renk: 'Renk', beden: 'Beden', numara: 'Numara', desen: 'Desen', cinsiyet: 'Cinsiyet' };
  return labels[value] || value || '-';
}

export function MarketplaceMappingCenterPage({
  initialTab = 'categories',
  singleTab = false,
  pageTitle,
  pageDescription,
}) {
  const [searchParams] = useSearchParams();
  const { notify, user } = useApp();
  const { loading, error, setError, run } = useAsync();
  const canManageCatalog = hasPermission(user, 'marketplaces.manage');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [marketplaceCode, setMarketplaceCode] = useState('trendyol');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState(searchParams.get('category') || searchParams.get('brand') || '');
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const [onlyRequiredMissing, setOnlyRequiredMissing] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [marketplaceAccounts, setMarketplaceAccounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [catalog, setCatalog] = useState({ categories: [], brands: [], attributes: [] });
  const [providerCatalog, setProviderCatalog] = useState({ categories: [], brands: [], attributesByCategory: {} });
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState({ categories: [], brands: [], attributes: [], variants: [], readiness: [] });
  const [selected, setSelected] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...emptyForms[initialTab], marketplace_code: 'trendyol' });
  const [valueMapText, setValueMapText] = useState('');
  const [workflowModal, setWorkflowModal] = useState('');
  const [workflowDetail, setWorkflowDetail] = useState(null);
  const [syncLoading, setSyncLoading] = useState('');

  const defaultCompanyId = companies[0]?.id || products[0]?.company_id || '';
  const localCategories = useMemo(() => {
    const resourceNames = catalog.categories.map((item) => item.name).filter(Boolean);
    const productNames = products.map((product) => product.category).filter(Boolean);
    return [...new Set([...resourceNames, ...productNames])];
  }, [catalog.categories, products]);
  const localBrands = useMemo(() => {
    const resourceNames = catalog.brands.map((item) => item.name).filter(Boolean);
    const productNames = products.map((product) => product.brand).filter(Boolean);
    return [...new Set([...resourceNames, ...productNames])];
  }, [catalog.brands, products]);

  const categorySuggestions = useMemo(() => localCategories.map((name) => ({ name })), [localCategories]);
  const brandSuggestions = useMemo(() => localBrands.map((name) => ({ name })), [localBrands]);
  const providerCategorySuggestions = useMemo(() => providerCatalog.categories.map((item) => ({
    id: item.external_id,
    name: item.path || item.name,
    path: item.path,
    categoryName: item.name,
    confidence: 'catalog',
  })), [providerCatalog.categories]);
  const providerBrandSuggestions = useMemo(() => providerCatalog.brands.map((item) => ({
    id: item.external_id,
    name: item.name,
    confidence: 'catalog',
  })), [providerCatalog.brands]);
  const effectiveCategorySuggestions = providerCategorySuggestions.length > 0 ? providerCategorySuggestions : categorySuggestions;
  const effectiveBrandSuggestions = providerBrandSuggestions.length > 0 ? providerBrandSuggestions : brandSuggestions;
  const categoryMappedNames = useMemo(() => new Set(rows.categories.map((row) => row.local_category_name).filter(Boolean)), [rows.categories]);
  const brandMappedNames = useMemo(() => new Set(rows.brands.map((row) => row.local_brand_name).filter(Boolean)), [rows.brands]);
  const requiredAttributes = useMemo(() => rows.attributes.filter((row) => row.required), [rows.attributes]);
  const missingVariantCount = summary?.missing_variant_attribute_count ?? rows.readiness.reduce((sum, row) => sum + (row.missing_variant_attributes?.length || 0), 0);
  const selectedMarketplaceAccount = useMemo(() => marketplaceAccounts.find((account) => account.code === marketplaceCode), [marketplaceAccounts, marketplaceCode]);
  const selectedCategoryId = String(workflowDetail?.marketplace_category_id || form.marketplace_category_id || selected?.marketplace_category_id || '');
  const selectedCategoryAttributes = selectedCategoryId ? providerCatalog.attributesByCategory[selectedCategoryId] || [] : [];
  const cacheStatus = useMemo(() => ({
    categories: {
      count: providerCatalog.categories.length,
      lastSyncedAt: latestSyncedAt(providerCatalog.categories),
    },
    brands: {
      count: providerCatalog.brands.length,
      lastSyncedAt: latestSyncedAt(providerCatalog.brands),
    },
    attributes: {
      count: selectedCategoryAttributes.length,
      lastSyncedAt: latestSyncedAt(selectedCategoryAttributes),
      categoryId: selectedCategoryId,
    },
  }), [providerCatalog.categories, providerCatalog.brands, selectedCategoryAttributes, selectedCategoryId]);

  const tableRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');
    const source = activeTab === 'readiness' ? rows.readiness : rows[activeTab] || [];
    const filtered = source.filter((row) => {
      const text = JSON.stringify(row).toLocaleLowerCase('tr-TR');
      const matchesSearch = !query || text.includes(query);
      const matchesStatus = !statusFilter || row.status === statusFilter || row.readiness_status === statusFilter;
      const matchesRequired = !onlyRequiredMissing || (row.missing_required_attributes || []).length > 0 || row.required;

      return matchesSearch && matchesStatus && matchesRequired;
    });
    if (activeTab === 'attributes') {
      return [...filtered].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));
    }
    if (activeTab === 'variants') {
      return [...filtered].sort((a, b) => variantKeys.indexOf(a.variant_key) - variantKeys.indexOf(b.variant_key));
    }
    return filtered;
  }, [activeTab, rows, search, statusFilter, onlyRequiredMissing]);

  const unmappedCategoryRows = useMemo(() => localCategories
    .filter((name) => !categoryMappedNames.has(name))
    .map((name, index) => ({ id: `category-${index}`, local_category_name: name, status: 'unmapped' })), [localCategories, categoryMappedNames]);
  const unmappedBrandRows = useMemo(() => localBrands
    .filter((name) => !brandMappedNames.has(name))
    .map((name, index) => ({ id: `brand-${index}`, local_brand_name: name, status: 'unmapped' })), [localBrands, brandMappedNames]);

  const visibleRows = onlyUnmapped && activeTab === 'categories' ? unmappedCategoryRows
    : onlyUnmapped && activeTab === 'brands' ? unmappedBrandRows
      : tableRows;

  const load = async () => {
    await run(async () => {
      const params = { marketplace_code: marketplaceCode };
      const [companyResponse, accountResponse, productResponse, categoryResource, brandResource, attributeResource, catalogCategories, catalogBrands, summaryResponse, categories, brands, attributes, variants, preview] = await Promise.allSettled([
        api.companies.list(),
        canManageCatalog ? api.marketplaces.list() : Promise.resolve([]),
        api.products.list(),
        api.catalogResources.list({ type: 'categories', active: 1 }),
        api.catalogResources.list({ type: 'brands', active: 1 }),
        api.catalogResources.list({ type: 'attributes', active: 1 }),
        api.marketplaceCatalog.categories(marketplaceCode),
        api.marketplaceCatalog.brands(marketplaceCode),
        api.marketplaceMappings.summary(params),
        api.marketplaceMappings.categories.list(params),
        api.marketplaceMappings.brands.list(params),
        api.marketplaceMappings.attributes.list(params),
        api.marketplaceMappings.variants.list(params),
        api.marketplaceMappings.readinessPreview(params),
      ]);
      setCompanies(companyResponse.status === 'fulfilled' ? asArray(companyResponse.value) : []);
      setMarketplaceAccounts(accountResponse.status === 'fulfilled' ? asArray(accountResponse.value) : []);
      setProducts(productResponse.status === 'fulfilled' ? asArray(productResponse.value) : []);
      setCatalog({
        categories: categoryResource.status === 'fulfilled' ? asArray(categoryResource.value) : [],
        brands: brandResource.status === 'fulfilled' ? asArray(brandResource.value) : [],
        attributes: attributeResource.status === 'fulfilled' ? asArray(attributeResource.value) : [],
      });
      setProviderCatalog((current) => ({
        ...current,
        categories: catalogCategories.status === 'fulfilled' ? asArray(catalogCategories.value) : [],
        brands: catalogBrands.status === 'fulfilled' ? asArray(catalogBrands.value) : [],
      }));
      setSummary(summaryResponse.status === 'fulfilled' ? summaryResponse.value : null);
      setRows({
        categories: categories.status === 'fulfilled' ? asArray(categories.value) : [],
        brands: brands.status === 'fulfilled' ? asArray(brands.value) : [],
        attributes: attributes.status === 'fulfilled' ? asArray(attributes.value) : [],
        variants: variants.status === 'fulfilled' ? asArray(variants.value) : [],
        readiness: preview.status === 'fulfilled' ? asArray(preview.value) : [],
      });
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    load();
  }, [marketplaceCode, canManageCatalog]);

  useEffect(() => {
    const stepParam = workflowStepMap[searchParams.get('step') || ''];
    const marketplaceParam = searchParams.get('marketplace');
    const categoryParam = searchParams.get('category_id') || searchParams.get('category') || searchParams.get('brand');

    if (marketplaceParam && ['trendyol', 'hepsiburada'].includes(marketplaceParam)) {
      setMarketplaceCode(marketplaceParam);
    }
    if (categoryParam) {
      setSearch(categoryParam);
    }
    if (stepParam) {
      setActiveTab(stepParam);
      if (!singleTab) setWorkflowDetail(null);
    }
  }, [searchParams, singleTab]);

  useEffect(() => {
    resetForm(activeTab);
  }, [activeTab, marketplaceCode, defaultCompanyId]);

  useEffect(() => {
    if (singleTab) setActiveTab(initialTab);
  }, [initialTab, singleTab]);

  const resetForm = (tab = activeTab) => {
    setEditingId(null);
    setSelected(null);
    setValueMapText('');
    setForm({ ...emptyForms[tab === 'readiness' ? 'categories' : tab], marketplace_code: marketplaceCode, company_id: defaultCompanyId });
  };

  const selectRow = (row) => {
    setSelected(row);
    if (activeTab === 'readiness') return;
    if (String(row.id).includes('-')) {
      const nextForm = {
        ...emptyForms[activeTab],
        marketplace_code: marketplaceCode,
        company_id: defaultCompanyId,
        ...(activeTab === 'categories' ? { local_category_name: row.local_category_name } : { local_brand_name: row.local_brand_name }),
      };
      if (activeTab === 'brands') {
        const suggestion = suggestionFor(row.local_brand_name, effectiveBrandSuggestions);
        if (suggestion) {
          nextForm.marketplace_brand_id = suggestion.id || '';
          nextForm.marketplace_brand_name = suggestion.name;
          nextForm.confidence = suggestion.confidence;
        }
      }
      if (activeTab === 'categories') {
        const suggestion = suggestionFor(row.local_category_name, effectiveCategorySuggestions);
        if (suggestion) {
          nextForm.marketplace_category_id = suggestion.id || '';
          nextForm.marketplace_category_name = suggestion.categoryName || suggestion.name;
          nextForm.marketplace_category_path = suggestion.path || suggestion.name;
          nextForm.confidence = suggestion.confidence;
        }
      }
      setEditingId(null);
      setForm(nextForm);
      setValueMapText('');
      return;
    }
    setEditingId(row.id);
    setForm({ ...emptyForms[activeTab], ...row, company_id: row.company_id || defaultCompanyId, marketplace_code: row.marketplace_code || marketplaceCode });
    setValueMapText(jsonText(row.value_map));
  };

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event) => {
    event.preventDefault();
    if (activeTab === 'readiness') return;
    await run(async () => {
      const payload = { ...form, company_id: form.company_id || defaultCompanyId, marketplace_code: marketplaceCode };
      if (activeTab === 'attributes' || activeTab === 'variants') {
        payload.value_map = parseJson(valueMapText);
      }
      const endpoint = api.marketplaceMappings[activeTab];
      const response = editingId ? await endpoint.update(editingId, payload) : await endpoint.create(payload);
      notify('success', editingId ? 'Eslesme guncellendi.' : 'Eslesme kaydedildi.');
      setSelected(response);
      setEditingId(response.id);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const remove = async () => {
    if (!editingId || activeTab === 'readiness') return;
    await run(async () => {
      await api.marketplaceMappings[activeTab].remove(editingId);
      notify('success', 'Eslesme silindi.');
      resetForm(activeTab);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const applySuggestion = () => {
    if (activeTab === 'brands') {
      const suggestion = suggestionFor(form.local_brand_name, effectiveBrandSuggestions);
      if (!suggestion) {
        notify('error', 'Uygun marka onerisi bulunamadi.');
        return;
      }
      setValue('marketplace_brand_id', suggestion.id || '');
      setValue('marketplace_brand_name', suggestion.name);
      setValue('confidence', suggestion.confidence);
      return;
    }
    if (activeTab === 'categories') {
      const suggestion = suggestionFor(form.local_category_name, effectiveCategorySuggestions);
      if (!suggestion) {
        notify('error', 'Uygun kategori onerisi bulunamadi.');
        return;
      }
      setValue('marketplace_category_id', suggestion.id || '');
      setValue('marketplace_category_name', suggestion.categoryName || suggestion.name);
      setValue('marketplace_category_path', suggestion.path || suggestion.name);
      setValue('confidence', suggestion.confidence);
    }
  };

  const loadProviderAttributes = async (categoryId) => {
    if (!categoryId || providerCatalog.attributesByCategory[categoryId]) return;

    const response = await api.marketplaceCatalog.attributes(marketplaceCode, categoryId);
    setProviderCatalog((current) => ({
      ...current,
      attributesByCategory: {
        ...current.attributesByCategory,
        [categoryId]: asArray(response),
      },
    }));
  };

  const refreshProviderAttributes = async (categoryId) => {
    if (!categoryId) return;

    const response = await api.marketplaceCatalog.attributes(marketplaceCode, categoryId);
    setProviderCatalog((current) => ({
      ...current,
      attributesByCategory: {
        ...current.attributesByCategory,
        [categoryId]: asArray(response),
      },
    }));
  };

  const syncProviderCatalog = async (type, categoryId = selectedCategoryId) => {
    if (!canManageCatalog) return;
    if (marketplaceCode !== 'trendyol') {
      notify('error', 'Katalog cache sync bu sprintte yalnizca Trendyol icin aktif.');
      return;
    }
    if (!selectedMarketplaceAccount?.id) {
      notify('error', 'Sync icin aktif Trendyol pazaryeri hesabi bulunamadi.');
      return;
    }
    if (type === 'attributes' && !categoryId) {
      notify('error', 'Ozellikleri guncellemek icin once bir pazaryeri kategorisi secin.');
      return;
    }

    setSyncLoading(type);
    try {
      const response = type === 'categories'
        ? await api.marketplaceCatalog.syncCategories(marketplaceCode, selectedMarketplaceAccount.id)
        : type === 'brands'
          ? await api.marketplaceCatalog.syncBrands(marketplaceCode, selectedMarketplaceAccount.id)
          : await api.marketplaceCatalog.syncAttributes(marketplaceCode, categoryId, selectedMarketplaceAccount.id);

      if (type === 'attributes') {
        setProviderCatalog((current) => ({
          ...current,
          attributesByCategory: {
            ...current.attributesByCategory,
            [categoryId]: asArray(response),
          },
        }));
      } else {
        await load();
      }
      notify('success', `${response.count ?? asArray(response).length} kayit cache'e alindi.`);
    } catch (syncError) {
      notify('error', apiErrorMessage(syncError));
    } finally {
      setSyncLoading('');
    }
  };

  const bulkApplySuggestions = () => {
    notify('success', 'Toplu oneriler foundation modunda hazirlandi; bu sprintte otomatik provider yazimi yapilmaz.');
  };

  const openWorkflowModal = (tab) => {
    setActiveTab(tab);
    setWorkflowModal(tab);
    setWorkflowDetail(null);
    resetForm(tab);
  };

  const switchWorkflowModal = (tab) => {
    setActiveTab(tab);
    setWorkflowModal(tab);
    setWorkflowDetail(null);
    resetForm(tab);
  };

  if (!singleTab) {
    return (
      <MarketplaceMappingWorkflow
        error={error}
        loading={loading}
        load={load}
        marketplaceCode={marketplaceCode}
        setMarketplaceCode={setMarketplaceCode}
        summary={summary}
        rows={rows}
        products={products}
        requiredAttributes={requiredAttributes}
        missingVariantCount={missingVariantCount}
        workflowModal={workflowModal}
        openWorkflowModal={openWorkflowModal}
        closeWorkflowModal={() => { setWorkflowModal(''); setWorkflowDetail(null); }}
        workflowDetail={workflowDetail}
        setWorkflowDetail={setWorkflowDetail}
        switchWorkflowModal={switchWorkflowModal}
        search={search}
        setSearch={setSearch}
        onlyUnmapped={onlyUnmapped}
        setOnlyUnmapped={setOnlyUnmapped}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        activeTab={activeTab}
        visibleRows={visibleRows}
        selectRow={selectRow}
        selected={selected}
        form={form}
        setValue={setValue}
        save={save}
        loadingAction={loading}
        companies={companies}
        localCategories={localCategories}
        localBrands={localBrands}
        catalogAttributes={catalog.attributes}
        providerCategories={providerCatalog.categories}
        providerBrands={providerCatalog.brands}
        providerAttributesByCategory={providerCatalog.attributesByCategory}
        loadProviderAttributes={loadProviderAttributes}
        refreshProviderAttributes={refreshProviderAttributes}
        cacheStatus={cacheStatus}
        canManageCatalog={canManageCatalog}
        syncLoading={syncLoading}
        syncProviderCatalog={syncProviderCatalog}
        valueMapText={valueMapText}
        setValueMapText={setValueMapText}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={pageTitle || (singleTab ? pageCopy[activeTab]?.title : 'Pazaryeri Eslestirme Merkezi')}
        description={pageDescription || (singleTab ? pageCopy[activeTab]?.description : 'Kategori, marka, nitelik ve varyant eslesmelerini tek merkezde yonetin; hazirlik etkisini provider gonderimi yapmadan izleyin.')}
        actions={(
          <>
            <select className="header-select" value={marketplaceCode} onChange={(event) => setMarketplaceCode(event.target.value)}>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
            </select>
            <button type="button" className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} /> Yenile</button>
          </>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !summary ? <LoadingState /> : null}

      <section className="mapping-center-kpis">
        <div><span>Eslesmemis kategori</span><strong>{summary?.unmapped_category_count ?? 0}</strong></div>
        <div><span>Eslesmemis marka</span><strong>{summary?.unmapped_brand_count ?? 0}</strong></div>
        <div><span>Eksik zorunlu nitelik</span><strong>{summary?.missing_required_attribute_count ?? 0}</strong></div>
        <div><span>Eksik varyant</span><strong>{missingVariantCount}</strong></div>
        <div><span>Hazir urun</span><strong>{summary?.ready_product_count ?? 0}</strong></div>
        <div><span>Blocked urun</span><strong>{summary?.blocked_product_count ?? 0}</strong></div>
      </section>

      <section className="mapping-center-shell">
        <aside className="mapping-filter-panel">
          <div className="mapping-filter-heading">
            <SlidersHorizontal size={18} />
            <strong>Filtreler</strong>
          </div>
          <label className="resource-search compact-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kategori, marka, SKU ara" />
          </label>
          <Field label="Durum">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tum durumlar</option>
              {statusOptions.map((status) => <option key={status} value={status}>{mappingStatusLabel(status)}</option>)}
              <option value="ready">Hazir</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>
          <label className="check-row"><input type="checkbox" checked={onlyUnmapped} onChange={(event) => setOnlyUnmapped(event.target.checked)} /> Eslesmemisleri goster</label>
          <label className="check-row"><input type="checkbox" checked={onlyRequiredMissing} onChange={(event) => setOnlyRequiredMissing(event.target.checked)} /> Zorunlu nitelik eksikleri</label>
          {activeTab !== 'readiness' && <button type="button" className="secondary-button" onClick={bulkApplySuggestions}>Toplu onerileri hazirla</button>}
          <div className="mapping-filter-summary">
            <span>Kategori</span><strong>{summary?.category_mapping_count ?? 0}</strong>
            <span>Marka</span><strong>{summary?.brand_mapping_count ?? 0}</strong>
            <span>Nitelik</span><strong>{summary?.attribute_mapping_count ?? 0}</strong>
            <span>Varyant</span><strong>{summary?.variant_mapping_count ?? 0}</strong>
          </div>
        </aside>

        <main className="mapping-table-panel">
          {!singleTab && (
            <div className="mapping-tabs">
              {tabs.map(({ key, label, icon: Icon }) => (
                <button type="button" className={activeTab === key ? 'active' : ''} key={key} onClick={() => setActiveTab(key)}>
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          )}
          <MappingOperationSummary
            activeTab={activeTab}
            rows={rows}
            products={products}
            visibleRows={visibleRows}
            requiredAttributes={requiredAttributes}
            missingVariantCount={missingVariantCount}
          />
          <MappingTable activeTab={activeTab} rows={visibleRows} onSelect={selectRow} />
        </main>

        <aside className="mapping-detail-panel">
          <div className="mapping-detail-heading">
            <div>
              <span>Detay Paneli</span>
              <strong>{selected ? 'Secili kayit' : 'Yeni eslesme'}</strong>
            </div>
            {activeTab !== 'readiness' && <button type="button" className="secondary-button" onClick={() => resetForm(activeTab)}>Yeni</button>}
          </div>
          {activeTab === 'readiness' ? (
            <ReadinessDetail row={selected} />
          ) : (
            <form className="mapping-form" onSubmit={save}>
              <MappingInsight
                activeTab={activeTab}
                form={form}
                selected={selected}
                products={products}
                rows={rows}
                requiredAttributes={requiredAttributes}
                brandSuggestions={effectiveBrandSuggestions}
                categorySuggestions={effectiveCategorySuggestions}
              />
              <MappingForm
                activeTab={activeTab}
                form={form}
                setValue={setValue}
                companies={companies}
                localCategories={localCategories}
                localBrands={localBrands}
                catalogAttributes={catalog.attributes}
                providerCategories={providerCatalog.categories}
                providerBrands={providerCatalog.brands}
                valueMapText={valueMapText}
                setValueMapText={setValueMapText}
              />
              {(activeTab === 'categories' || activeTab === 'brands') && (
                <button type="button" className="secondary-button" onClick={applySuggestion}>Auto suggest uygula</button>
              )}
              <div className="wizard-actions inline-actions">
                <button disabled={loading}><Save size={16} /> {editingId ? 'Guncelle' : 'Kaydet'}</button>
                {editingId && <button type="button" className="secondary-button" disabled={loading} onClick={remove}><Trash2 size={16} /> Sil</button>}
              </div>
            </form>
          )}
          <div className="mapping-next-card">
            <strong>Simdi ne yapmaliyim?</strong>
            <span>{activeTab === 'categories' ? 'Kategori eslesmesi tamamlandiktan sonra zorunlu nitelikleri baglayin.' : activeTab === 'brands' ? 'Marka eslesmeleri hazirsa hazirlik merkezinde blocked urunleri kontrol edin.' : activeTab === 'attributes' ? 'Zorunlu nitelikler tamamlandiktan sonra varyantli urunlerin renk/beden uyumunu kontrol edin.' : activeTab === 'variants' ? 'Varyant eslesmeleri tamamlandiginda hazirlik merkezinden urunleri tekrar kontrol edin.' : 'Eksikleri ilgili mapping sayfasinda tamamlayip hazir urunleri gonderime alin.'}</span>
            <Link className="button-link secondary-link" to={pageCopy[activeTab]?.nextPath}>{pageCopy[activeTab]?.nextLabel}</Link>
          </div>
        </aside>
      </section>
    </>
  );
}

function MappingOperationSummary({ activeTab, rows, products, visibleRows, requiredAttributes, missingVariantCount }) {
  const data = {
    categories: [
      ['Gorunen kategori', visibleRows.length],
      ['Etkilenen urun', products.filter((product) => product.category).length],
      ['Kategori eksikli urun', countBy(rows.readiness, (row) => row.missing_category_mapping)],
    ],
    brands: [
      ['Gorunen marka', visibleRows.length],
      ['Etkilenen urun', products.filter((product) => product.brand).length],
      ['Marka eksikli urun', countBy(rows.readiness, (row) => row.missing_brand_mapping)],
    ],
    attributes: [
      ['Zorunlu attribute', requiredAttributes.length],
      ['Eksik attribute degeri', rows.readiness.reduce((sum, row) => sum + (row.missing_required_attributes?.length || 0), 0)],
      ['Blocked urun', countBy(rows.readiness, (row) => row.readiness_status === 'blocked')],
    ],
    variants: [
      ['Varyant eslesmesi', rows.variants.length],
      ['Eksik varyant degeri', missingVariantCount],
      ['Renk/Beden/Numara', ['renk', 'beden', 'numara'].filter((key) => rows.variants.some((row) => row.variant_key === key && row.status === 'active')).length],
    ],
    readiness: [
      ['Ready', countBy(rows.readiness, (row) => row.readiness_status === 'ready')],
      ['Blocked', countBy(rows.readiness, (row) => row.readiness_status === 'blocked')],
      ['Toplam preview', rows.readiness.length],
    ],
  };

  return (
    <section className="mapping-operation-strip">
      {(data[activeTab] || []).map(([label, value]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </section>
  );
}

function CatalogCacheStatusPanel({
  marketplaceCode,
  cacheStatus,
  canManageCatalog,
  syncLoading,
  onSyncCategories,
  onSyncBrands,
  onSyncAttributes,
}) {
  const isTrendyol = marketplaceCode === 'trendyol';
  const categoryEmpty = cacheStatus.categories.count === 0;
  const brandEmpty = cacheStatus.brands.count === 0;
  const attributeEmpty = Boolean(cacheStatus.attributes.categoryId) && cacheStatus.attributes.count === 0;

  return (
    <section className="catalog-cache-panel">
      <div className="catalog-cache-intro">
        <div>
          <span>Katalog Cache Durumu</span>
          <strong>{isTrendyol ? 'Trendyol kategori, marka ve nitelik verileri' : 'Cache sync yalnizca Trendyol icin aktif'}</strong>
        </div>
        <p>Pazaryeri kategori, marka ve özellik verileri güncel değilse eşleştirme eksik görünebilir.</p>
      </div>
      <div className="catalog-cache-grid">
        <CatalogCacheMetric title="Kategori cache" count={cacheStatus.categories.count} lastSyncedAt={cacheStatus.categories.lastSyncedAt} empty={categoryEmpty} />
        <CatalogCacheMetric title="Marka cache" count={cacheStatus.brands.count} lastSyncedAt={cacheStatus.brands.lastSyncedAt} empty={brandEmpty} />
        <CatalogCacheMetric
          title="Seçili kategori özellik cache"
          count={cacheStatus.attributes.categoryId ? cacheStatus.attributes.count : '-'}
          lastSyncedAt={cacheStatus.attributes.lastSyncedAt}
          empty={attributeEmpty}
          note={cacheStatus.attributes.categoryId ? `Kategori ID: ${cacheStatus.attributes.categoryId}` : 'Kategori secilmedi'}
        />
      </div>
      {(categoryEmpty || brandEmpty || attributeEmpty) && (
        <div className="catalog-cache-empty">
          <AlertTriangle size={17} />
          <div>
            {categoryEmpty && <p>Henüz pazaryeri kategori verisi bulunmuyor. Kategorileri Güncelle butonuyla Trendyol’dan kategori listesini çekin.</p>}
            {brandEmpty && <p>Henüz marka verisi bulunmuyor. Markaları Güncelle butonuyla marka listesini çekin.</p>}
            {attributeEmpty && <p>Bu kategori için özellik verisi bulunmuyor. Özellikleri Güncelle butonuyla zorunlu nitelikleri çekin.</p>}
          </div>
        </div>
      )}
      {canManageCatalog && isTrendyol && (
        <div className="catalog-cache-actions">
          <button type="button" className="secondary-button" disabled={Boolean(syncLoading)} onClick={onSyncCategories}>
            <RefreshCw size={16} /> {syncLoading === 'categories' ? 'Guncelleniyor...' : 'Kategorileri Guncelle'}
          </button>
          <button type="button" className="secondary-button" disabled={Boolean(syncLoading)} onClick={onSyncBrands}>
            <RefreshCw size={16} /> {syncLoading === 'brands' ? 'Guncelleniyor...' : 'Markalari Guncelle'}
          </button>
          <button type="button" className="secondary-button" disabled={Boolean(syncLoading) || !cacheStatus.attributes.categoryId} onClick={onSyncAttributes}>
            <RefreshCw size={16} /> {syncLoading === 'attributes' ? 'Guncelleniyor...' : 'Secili Kategori Ozelliklerini Guncelle'}
          </button>
        </div>
      )}
    </section>
  );
}

function CatalogCacheMetric({ title, count, lastSyncedAt, empty, note }) {
  return (
    <div className={`catalog-cache-metric ${empty ? 'empty' : 'ready'}`}>
      <span>{title}</span>
      <strong>{count}</strong>
      <small>Son guncelleme: {formatCacheDate(lastSyncedAt)}</small>
      {note && <em>{note}</em>}
    </div>
  );
}

function MappingInsight({ activeTab, form, selected, products, rows, requiredAttributes, brandSuggestions, categorySuggestions }) {
  if (activeTab === 'categories') {
    const name = form.local_category_name || selected?.local_category_name;
    const categoryId = form.marketplace_category_id || selected?.marketplace_category_id;
    const affected = countBy(products, (product) => product.category === name);
    const missing = countBy(rows.readiness, (row) => row.category === name && row.missing_category_mapping);
    const requiredCount = requiredAttributes.filter((row) => !categoryId || String(row.marketplace_category_id || '') === String(categoryId)).length;
    const suggestion = suggestionFor(name, categorySuggestions);
    return (
      <div className="mapping-insight-card">
        <strong>Trendyol kategori bilgisi</strong>
        <span>{form.marketplace_category_name || selected?.marketplace_category_name || suggestion?.name || 'Kategori adi bekleniyor'}</span>
        <div className="mapping-mini-grid">
          <div><small>Kategori yolu</small><b>{form.marketplace_category_path || selected?.marketplace_category_path || '-'}</b></div>
          <div><small>Zorunlu attribute</small><b>{requiredCount}</b></div>
          <div><small>Etkilenen urun</small><b>{affected}</b></div>
          <div><small>Eksik urun</small><b>{missing}</b></div>
        </div>
      </div>
    );
  }

  if (activeTab === 'brands') {
    const name = form.local_brand_name || selected?.local_brand_name;
    const affected = countBy(products, (product) => product.brand === name);
    const missing = countBy(rows.readiness, (row) => row.brand === name && row.missing_brand_mapping);
    const suggestion = suggestionFor(name, brandSuggestions);
    return (
      <div className="mapping-insight-card">
        <strong>Marka eslestirme etkisi</strong>
        <span>{suggestion ? `Oneri: ${suggestion.name} (${suggestion.confidence})` : 'Oneri icin marka adini secin veya yazin.'}</span>
        <div className="mapping-mini-grid">
          <div><small>Etkilenen urun</small><b>{affected}</b></div>
          <div><small>Eksik urun</small><b>{missing}</b></div>
          <div><small>Pazaryeri marka</small><b>{form.marketplace_brand_name || '-'}</b></div>
          <div><small>Guven</small><b>{form.confidence || suggestion?.confidence || '-'}</b></div>
        </div>
      </div>
    );
  }

  if (activeTab === 'attributes') {
    const attributeName = form.marketplace_attribute_name || selected?.marketplace_attribute_name;
    const missing = countBy(rows.readiness, (row) => (row.missing_required_attributes || []).includes(attributeName));
    return (
      <div className="mapping-insight-card">
        <strong>{form.required || selected?.required ? 'Zorunlu attribute' : 'Opsiyonel attribute'}</strong>
        <span>{attributeName || 'Attribute adi bekleniyor'}</span>
        <div className="mapping-mini-grid">
          <div><small>Eksik urun</small><b>{missing}</b></div>
          <div><small>Kaynak tipi</small><b>{sourceTypeLabel(form.source_type || selected?.source_type)}</b></div>
          <div><small>Kaynak alan</small><b>{form.source_field || selected?.source_field || form.fixed_value || '-'}</b></div>
          <div><small>Readiness</small><b>{missing > 0 ? 'Blocked etkisi var' : 'Temiz'}</b></div>
        </div>
      </div>
    );
  }

  if (activeTab === 'variants') {
    const variantKey = form.variant_key || selected?.variant_key;
    const attributeName = form.marketplace_attribute_name || selected?.marketplace_attribute_name;
    const missing = countBy(rows.readiness, (row) => (row.missing_variant_attributes || []).includes(attributeName));
    return (
      <div className="mapping-insight-card">
        <strong>{variantLabel(variantKey)} varyant eslesmesi</strong>
        <span>{attributeName || 'Pazaryeri attribute adi bekleniyor'}</span>
        <div className="mapping-mini-grid">
          <div><small>Eksik urun</small><b>{missing}</b></div>
          <div><small>Source field</small><b>{form.source_field || selected?.source_field || variantKey || '-'}</b></div>
          <div><small>Renk/Beden/Numara</small><b>{['renk', 'beden', 'numara'].includes(variantKey) ? 'Ana varyant' : 'Ek varyant'}</b></div>
          <div><small>Readiness</small><b>{missing > 0 ? 'Blocked etkisi var' : 'Temiz'}</b></div>
        </div>
      </div>
    );
  }

  return null;
}

export function MarketplaceReadinessPage() {
  return <MarketplaceMappingCenterPage initialTab="readiness" singleTab />;
}

export function MarketplaceCategoryMappingPage() {
  return <MarketplaceMappingCenterPage initialTab="categories" singleTab />;
}

export function MarketplaceBrandMappingPage() {
  return <MarketplaceMappingCenterPage initialTab="brands" singleTab />;
}

export function MarketplaceAttributeMappingPage() {
  return <MarketplaceMappingCenterPage initialTab="attributes" singleTab />;
}

export function MarketplaceVariantMappingPage() {
  return <MarketplaceMappingCenterPage initialTab="variants" singleTab />;
}

const marketplaceTabs = [
  { label: 'Entegrasyonlar', to: '/marketplaces' },
  { label: 'Eşleştirme Merkezi', to: '/marketplace-mapping' },
  { label: 'Toplu Gönderim', to: '/products/publish-wizard' },
  { label: 'Gönderim Kuyruğu', to: '/products/publish-queue' },
];

const sourceFieldOptions = [
  'brand',
  'category',
  'color',
  'size',
  'gender',
  'material',
  'product.name',
  'product.description',
  'variant.renk',
  'variant.beden',
];

function MarketplaceModuleTabs({ active }) {
  return (
    <nav className="marketplace-module-tabs" aria-label="Pazaryeri akışı">
      {marketplaceTabs.map((tab) => (
        <Link className={active === tab.to ? 'active' : ''} to={tab.to} key={tab.to}>{tab.label}</Link>
      ))}
    </nav>
  );
}

function MarketplaceMappingWorkflow({
  error,
  loading,
  load,
  marketplaceCode,
  setMarketplaceCode,
  summary,
  rows,
  products,
  requiredAttributes,
  missingVariantCount,
  activeTab,
  visibleRows,
  selectRow,
  selected,
  form,
  setValue,
  save,
  loadingAction,
  providerCategories,
  providerBrands,
  providerAttributesByCategory,
  loadProviderAttributes,
  cacheStatus,
  canManageCatalog,
  syncLoading,
  syncProviderCatalog,
  valueMapText,
  setValueMapText,
  switchWorkflowModal,
  search,
  setSearch,
  onlyUnmapped,
  setOnlyUnmapped,
  statusFilter,
  setStatusFilter,
}) {
  const navigate = useNavigate();
  const mappedCategories = rows.categories.filter(isMappedCategory);
  const selectedCategoryRow = selected?.marketplace_category_id ? selected : mappedCategories[0] || rows.categories[0];
  const selectedCategoryId = String(selectedCategoryRow?.marketplace_category_id || form.marketplace_category_id || '');
  const providerAttributeRows = selectedCategoryId ? providerAttributesByCategory[selectedCategoryId] || [] : [];
  const categoryMissing = Number(summary?.unmapped_category_count || 0);
  const brandMissing = Number(summary?.unmapped_brand_count || 0);
  const attributeMissing = Number(summary?.missing_required_attribute_count || 0);
  const variantMissing = Number(missingVariantCount || 0);
  const readyCount = Number(summary?.ready_product_count || rows.readiness.filter((row) => row.readiness_status === 'ready').length || 0);
  const blockedCount = Number(summary?.blocked_product_count || rows.readiness.filter((row) => row.readiness_status === 'blocked').length || 0);

  const workflowSteps = [
    { key: 'categories', no: 1, title: 'Kategori', text: 'Yerel kategorileri pazaryeri kategori ağacına bağlayın.', missing: categoryMissing, affected: products.filter((product) => product.category).length, cta: 'Kategori seç' },
    { key: 'brands', no: 2, title: 'Marka', text: 'Marka eşleşmesi olmayan ürünlerin reddedilmesini önleyin.', missing: brandMissing, affected: products.filter((product) => product.brand).length, cta: 'Marka eşleştir' },
    { key: 'attributes', no: 3, title: 'Özellik / Nitelik', text: 'Zorunlu nitelikleri ürün, varyant veya sabit değerlerden besleyin.', missing: attributeMissing, affected: requiredAttributes.length, cta: 'Nitelik bağla' },
    { key: 'variants', no: 4, title: 'Varyant', text: 'Renk, beden ve numara gibi varyant alanlarını netleştirin.', missing: variantMissing, affected: rows.variants.length, cta: 'Varyant eşleştir' },
    { key: 'readiness', no: 5, title: 'Hazırlık Kontrolü', text: 'Hazır, eksik ve blocked ürünleri son kez kontrol edin.', missing: blockedCount, affected: rows.readiness.length, cta: 'Hazırlığı gör' },
  ];

  const stepState = (step) => {
    if (step.key === 'readiness') return blockedCount > 0 ? 'missing' : readyCount > 0 ? 'complete' : 'pending';
    if (step.missing > 0) return 'missing';
    if (step.affected > 0) return 'complete';
    return step.key === 'categories' ? 'missing' : 'pending';
  };

  const goStep = (key) => {
    switchWorkflowModal(key);
    const next = new URLSearchParams(window.location.search);
    next.set('step', key);
    navigate(`/marketplace-mapping?${next.toString()}`, { replace: true });
  };

  const refreshAll = async () => {
    if (canManageCatalog && marketplaceCode === 'trendyol') {
      await syncProviderCatalog('categories');
      await syncProviderCatalog('brands');
    }
  };

  return (
    <>
      <PageHeader
        title="Pazaryeri Hazırlık Merkezi"
        description="Kategori, marka, nitelik ve varyant eşleştirmelerini sırayla tamamlayın; hazır ürünleri güvenle gönderime alın."
        actions={(
          <>
            <select className="header-select" value={marketplaceCode} onChange={(event) => setMarketplaceCode(event.target.value)}>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
            </select>
            <button type="button" className="secondary-button" disabled={loading || Boolean(syncLoading)} onClick={refreshAll}><RefreshCw size={16} /> Katalog verilerini güncelle</button>
            <button type="button" className="secondary-button" disabled={loading} onClick={load}><RefreshCw size={16} /> Hazırlığı yenile</button>
            <Link className="button-link" to="/products/publish-wizard"><Send size={16} /> Hazır ürünleri gönder</Link>
          </>
        )}
      />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !summary ? <LoadingState /> : null}

      <MarketplaceModuleTabs active="/marketplace-mapping" />

      <section className="balina-flow-hint">
        <CheckCircle2 size={18} />
        <div>
          <strong>Ürünler pazaryerine gönderilmeden önce bu beş adım tamamlanır.</strong>
          <span>Eksik olan adıma tıklayın; çalışma alanı aynı sayfada açılır.</span>
        </div>
      </section>

      <section className="mapping-workflow-board">
        {workflowSteps.map((step) => {
          const state = stepState(step);
          return (
            <button type="button" className={`mapping-step-card ${activeTab === step.key ? 'active' : ''} ${stepStatusClass(state)}`} key={step.key} onClick={() => goStep(step.key)}>
              <span>{step.no}</span>
              <strong>{step.title}</strong>
              <small>{stepStatusLabel(state)}</small>
              <p>{step.text}</p>
              <em>{step.missing > 0 ? `${step.missing} eksik` : `${step.affected} kayıt`}</em>
              <b>{step.cta}</b>
            </button>
          );
        })}
      </section>

      <section className="mapping-workbench">
        <aside className="mapping-workbench-side">
          <div className="mapping-filter-heading">
            <SlidersHorizontal size={18} />
            <strong>Çalışma Alanı</strong>
          </div>
          <label className="resource-search compact-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Kategori, marka, ürün veya SKU ara" />
          </label>
          <label className="check-row"><input type="checkbox" checked={onlyUnmapped} onChange={(event) => setOnlyUnmapped(event.target.checked)} /> Sadece eşleşmemişleri göster</label>
          <Field label="Durum">
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tüm durumlar</option>
              {statusOptions.map((status) => <option key={status} value={status}>{mappingStatusLabel(status)}</option>)}
              <option value="ready">Hazır</option>
              <option value="blocked">Blocked</option>
            </select>
          </Field>
          <div className="mapping-cache-summary">
            <span>Kategori cache</span><strong>{cacheStatus.categories.count}</strong><small>{formatCacheDate(cacheStatus.categories.lastSyncedAt)}</small>
            <span>Marka cache</span><strong>{cacheStatus.brands.count}</strong><small>{formatCacheDate(cacheStatus.brands.lastSyncedAt)}</small>
            <span>Özellik cache</span><strong>{cacheStatus.attributes.categoryId ? cacheStatus.attributes.count : '-'}</strong><small>{cacheStatus.attributes.categoryId ? formatCacheDate(cacheStatus.attributes.lastSyncedAt) : 'Kategori seçilmedi'}</small>
          </div>
          {canManageCatalog && marketplaceCode === 'trendyol' ? (
            <div className="mapping-cache-actions">
              <button type="button" className="secondary-button" disabled={Boolean(syncLoading)} onClick={() => syncProviderCatalog('categories')}><RefreshCw size={16} /> Kategorileri Güncelle</button>
              <button type="button" className="secondary-button" disabled={Boolean(syncLoading)} onClick={() => syncProviderCatalog('brands')}><RefreshCw size={16} /> Markaları Güncelle</button>
              <button type="button" className="secondary-button" disabled={Boolean(syncLoading) || !selectedCategoryId} onClick={() => syncProviderCatalog('attributes', selectedCategoryId)}><RefreshCw size={16} /> Özellikleri Güncelle</button>
            </div>
          ) : <div className="soft-empty">Hepsiburada katalog cache sync henüz aktif değil; mevcut eşleşmeler gösterilir.</div>}
        </aside>

        <main className="mapping-workbench-main">
          {activeTab === 'categories' && (
            <CategoryMappingPanel
              rows={visibleRows}
              selected={selected}
              selectRow={selectRow}
              form={form}
              setValue={setValue}
              save={save}
              loading={loadingAction}
              providerCategories={providerCategories}
              products={products}
            />
          )}
          {activeTab === 'brands' && (
            <BrandMappingPanel
              rows={visibleRows}
              selected={selected}
              selectRow={selectRow}
              form={form}
              setValue={setValue}
              save={save}
              loading={loadingAction}
              providerBrands={providerBrands}
              products={products}
            />
          )}
          {activeTab === 'attributes' && (
            <AttributeMappingPanel
              categoryRows={mappedCategories}
              selectedCategoryRow={selectedCategoryRow}
              providerAttributeRows={providerAttributeRows}
              rows={rows.attributes}
              form={form}
              setValue={setValue}
              save={save}
              loading={loadingAction}
              loadProviderAttributes={loadProviderAttributes}
              selectedCategoryId={selectedCategoryId}
              valueMapText={valueMapText}
              setValueMapText={setValueMapText}
              syncLoading={syncLoading}
              syncProviderCatalog={syncProviderCatalog}
              canManageCatalog={canManageCatalog}
              marketplaceCode={marketplaceCode}
            />
          )}
          {activeTab === 'variants' && (
            <VariantMappingPanel rows={rows.variants} form={form} setValue={setValue} save={save} loading={loadingAction} selectedCategoryRow={selectedCategoryRow} />
          )}
          {activeTab === 'readiness' && (
            <ReadinessPanel rows={rows.readiness} load={load} readyCount={readyCount} blockedCount={blockedCount} />
          )}
        </main>
      </section>
    </>
  );
}

function CategoryMappingPanel({ rows, selected, selectRow, form, setValue, save, loading, providerCategories, products }) {
  const [providerSearch, setProviderSearch] = useState('');
  const selectedName = form.local_category_name || selected?.local_category_name || rows[0]?.local_category_name || '';
  const filteredProviders = providerCategories
    .filter((item) => !providerSearch || `${item.external_id} ${item.name} ${item.path}`.toLocaleLowerCase('tr-TR').includes(providerSearch.toLocaleLowerCase('tr-TR')))
    .slice(0, 40);
  const affectedProducts = countBy(products, (product) => product.category === selectedName);

  return (
    <div className="mapping-panel-grid">
      <section className="mapping-list-panel">
        <div className="mapping-panel-title"><span>Kategori Eşleştirme</span><strong>Yerel kategoriler</strong></div>
        <div className="mapping-scroll-list">
          {rows.length === 0 ? <div className="soft-empty">Eşleşecek kategori bulunamadı.</div> : rows.map((row, index) => {
            const mapped = isMappedCategory(row);
            return (
              <button type="button" className={selected?.id === row.id ? 'mapping-list-row active' : 'mapping-list-row'} key={row.id || index} onClick={() => selectRow(row)}>
                <strong>{row.local_category_name || '-'}</strong>
                <span>{countBy(products, (product) => product.category === row.local_category_name)} ürün</span>
                <small className={mapped ? 'ready' : 'blocked'}>{mapped ? 'Hazır' : 'Eksik'}</small>
              </button>
            );
          })}
        </div>
      </section>
      <form className="mapping-editor-panel" onSubmit={save}>
        <div className="mapping-panel-title"><span>Pazaryeri kategorisi</span><strong>{selectedName || 'Kategori seçin'}</strong></div>
        <p>Ürünlerinizi göndereceğiniz pazaryeri kategorisini seçin. ID, ad ve breadcrumb birlikte kaydedilir.</p>
        <Field label="Yerel kategori"><input value={form.local_category_name || selectedName} onChange={(event) => setValue('local_category_name', event.target.value)} /></Field>
        <label className="resource-search compact-search provider-picker-search"><Search size={16} /><input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="Kategori adı, ID veya kategori yolu ara" /></label>
        <div className="provider-choice-list">
          {filteredProviders.length === 0 ? <div className="soft-empty">Henüz pazaryeri kategori verisi yok. Kategorileri Güncelle ile cache’i doldurun.</div> : filteredProviders.map((item) => (
            <button type="button" className={String(form.marketplace_category_id) === String(item.external_id) ? 'active' : ''} key={item.external_id} onClick={() => { setValue('marketplace_category_id', item.external_id || ''); setValue('marketplace_category_name', item.name || ''); setValue('marketplace_category_path', item.path || item.name || ''); setValue('confidence', 'catalog'); }}>
              <strong>{item.name}</strong><span>{item.path || item.name}</span><small>ID: {item.external_id}</small>
            </button>
          ))}
        </div>
        <div className="mapping-mini-grid">
          <div><small>Pazaryeri kategori ID</small><b>{form.marketplace_category_id || '-'}</b></div>
          <div><small>Kategori yolu</small><b>{form.marketplace_category_path || '-'}</b></div>
          <div><small>Etkilenen ürün</small><b>{affectedProducts}</b></div>
          <div><small>Eşleşme güveni</small><b>{form.confidence || 'manual'}</b></div>
        </div>
        <div className="wizard-actions inline-actions"><button disabled={loading}><Save size={16} /> Kategori eşleşmesini kaydet</button></div>
      </form>
    </div>
  );
}

function BrandMappingPanel({ rows, selected, selectRow, form, setValue, save, loading, providerBrands, products }) {
  const [providerSearch, setProviderSearch] = useState('');
  const selectedName = form.local_brand_name || selected?.local_brand_name || rows[0]?.local_brand_name || '';
  const filteredProviders = providerBrands
    .filter((item) => !providerSearch || `${item.external_id} ${item.name}`.toLocaleLowerCase('tr-TR').includes(providerSearch.toLocaleLowerCase('tr-TR')))
    .slice(0, 40);
  const affectedProducts = countBy(products, (product) => product.brand === selectedName);
  const suggestion = suggestionFor(selectedName, providerBrands.map((item) => ({ id: item.external_id, name: item.name, confidence: 'catalog' })));

  return (
    <div className="mapping-panel-grid">
      <section className="mapping-list-panel">
        <div className="mapping-panel-title"><span>Marka Eşleştirme</span><strong>Yerel markalar</strong></div>
        <div className="mapping-scroll-list">
          {rows.length === 0 ? <div className="soft-empty">Eşleşecek marka bulunamadı.</div> : rows.map((row, index) => {
            const mapped = Boolean(row.marketplace_brand_id || row.marketplace_brand_name);
            return (
              <button type="button" className={selected?.id === row.id ? 'mapping-list-row active' : 'mapping-list-row'} key={row.id || index} onClick={() => selectRow(row)}>
                <strong>{row.local_brand_name || '-'}</strong>
                <span>{countBy(products, (product) => product.brand === row.local_brand_name)} ürün</span>
                <small className={mapped ? 'ready' : 'blocked'}>{mapped ? 'Hazır' : 'Eksik'}</small>
              </button>
            );
          })}
        </div>
      </section>
      <form className="mapping-editor-panel" onSubmit={save}>
        <div className="mapping-panel-title"><span>Pazaryeri markası</span><strong>{selectedName || 'Marka seçin'}</strong></div>
        <p>Marka bilgisi ürün listeleme için zorunludur. Marka eşleşmesi olmayan ürünler pazaryerinde reddedilebilir.</p>
        <Field label="Yerel marka"><input value={form.local_brand_name || selectedName} onChange={(event) => setValue('local_brand_name', event.target.value)} /></Field>
        {suggestion && <div className="mapping-suggestion"><strong>Öneri</strong><span>{suggestion.name}</span><small>Güven: {suggestion.confidence}</small><button type="button" onClick={() => { setValue('marketplace_brand_id', suggestion.id || ''); setValue('marketplace_brand_name', suggestion.name); setValue('confidence', suggestion.confidence); }}>Öneriyi uygula</button></div>}
        <label className="resource-search compact-search provider-picker-search"><Search size={16} /><input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="Marka adı veya ID ara" /></label>
        <div className="provider-choice-list compact">
          {filteredProviders.length === 0 ? <div className="soft-empty">Henüz marka verisi yok. Markaları Güncelle ile cache’i doldurun.</div> : filteredProviders.map((item) => (
            <button type="button" className={String(form.marketplace_brand_id) === String(item.external_id) ? 'active' : ''} key={item.external_id || item.name} onClick={() => { setValue('marketplace_brand_id', item.external_id || ''); setValue('marketplace_brand_name', item.name || ''); setValue('confidence', 'catalog'); }}>
              <strong>{item.name}</strong><small>ID: {item.external_id || '-'}</small>
            </button>
          ))}
        </div>
        <div className="mapping-mini-grid">
          <div><small>Pazaryeri marka ID</small><b>{form.marketplace_brand_id || '-'}</b></div>
          <div><small>Pazaryeri marka</small><b>{form.marketplace_brand_name || '-'}</b></div>
          <div><small>Etkilenen ürün</small><b>{affectedProducts}</b></div>
          <div><small>Eşleşme tipi</small><b>{form.confidence || 'manual'}</b></div>
        </div>
        <div className="wizard-actions inline-actions"><button disabled={loading}><Save size={16} /> Marka eşleşmesini kaydet</button></div>
      </form>
    </div>
  );
}

function AttributeMappingPanel({ categoryRows, selectedCategoryRow, providerAttributeRows, rows, form, setValue, save, loading, loadProviderAttributes, selectedCategoryId, valueMapText, setValueMapText, syncLoading, syncProviderCatalog, canManageCatalog, marketplaceCode }) {
  const [localCategoryId, setLocalCategoryId] = useState(selectedCategoryId || '');
  const effectiveCategory = categoryRows.find((row) => String(row.marketplace_category_id) === String(localCategoryId)) || selectedCategoryRow;
  const attributes = providerAttributeRows.length > 0 ? providerAttributeRows : rows;
  const sortedAttributes = [...attributes].sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)));

  useEffect(() => {
    if (effectiveCategory?.marketplace_category_id) loadProviderAttributes(effectiveCategory.marketplace_category_id);
  }, [effectiveCategory?.marketplace_category_id]);

  return (
    <div className="mapping-full-panel">
      <div className="mapping-panel-title"><span>Özellik / Nitelik Eşleştirme</span><strong>Önce kategori seçin</strong></div>
      <div className="mapping-category-context">
        <Field label="Kategori">
          <select value={localCategoryId || effectiveCategory?.marketplace_category_id || ''} onChange={(event) => { setLocalCategoryId(event.target.value); const row = categoryRows.find((item) => String(item.marketplace_category_id) === String(event.target.value)); if (row) { setValue('marketplace_category_id', row.marketplace_category_id); setValue('local_category_id', row.local_category_id || ''); loadProviderAttributes(row.marketplace_category_id); } }}>
            <option value="">Kategori seçin</option>
            {categoryRows.map((row) => <option key={row.id} value={row.marketplace_category_id}>{row.local_category_name} → {row.marketplace_category_path || row.marketplace_category_name}</option>)}
          </select>
        </Field>
        <div><span>Seçilen pazaryeri kategorisi</span><strong>{effectiveCategory?.marketplace_category_path || effectiveCategory?.marketplace_category_name || '-'}</strong></div>
        {canManageCatalog && marketplaceCode === 'trendyol' && <button type="button" className="secondary-button" disabled={!effectiveCategory?.marketplace_category_id || Boolean(syncLoading)} onClick={() => syncProviderCatalog('attributes', effectiveCategory.marketplace_category_id)}><RefreshCw size={16} /> Özellikleri Güncelle</button>}
      </div>
      {attributes.length === 0 && <div className="catalog-cache-empty inline"><AlertTriangle size={16} /><p>Bu kategori için özellik verisi bulunmuyor. Özellikleri Güncelle butonuyla zorunlu nitelikleri çekin.</p></div>}
      <div className="attribute-mapping-list">
        {sortedAttributes.map((attribute, index) => {
          const attributeName = attribute.name || attribute.marketplace_attribute_name;
          const required = Boolean(attribute.required);
          return (
            <form className={`attribute-map-row ${required ? 'required' : ''}`} key={attribute.external_id || attribute.id || index} onSubmit={save}>
              <div><strong>{attributeName}</strong><span>{required ? 'Zorunlu' : 'Opsiyonel'} · {attribute.value_type || attribute.valueType || 'Değer tipi yok'}</span></div>
              <select value={form.source_type || 'product_field'} onChange={(event) => setValue('source_type', event.target.value)}>
                <option value="product_field">Ürün alanı</option>
                <option value="variant_field">Varyant alanı</option>
                <option value="fixed_value">Sabit değer</option>
                <option value="custom_json">JSON/value map</option>
              </select>
              <select value={form.source_field || ''} onChange={(event) => { setValue('marketplace_category_id', effectiveCategory?.marketplace_category_id || ''); setValue('marketplace_attribute_id', attribute.external_id || attribute.marketplace_attribute_id || ''); setValue('marketplace_attribute_name', attributeName || ''); setValue('required', required); setValue('value_type', attribute.value_type || ''); setValue('source_field', event.target.value); }}>
                <option value="">Kaynak alan seç</option>
                {sourceFieldOptions.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={form.fixed_value || ''} onChange={(event) => setValue('fixed_value', event.target.value)} placeholder="Sabit değer" />
              <button disabled={loading}><Save size={15} /> Kaydet</button>
            </form>
          );
        })}
      </div>
      <div className="workflow-modal-warning"><AlertTriangle size={16} /><span>Renk ve beden gibi varyant alanlarını mümkünse Varyant adımında eşleştirin.</span></div>
      <Field label="JSON / value map"><textarea value={valueMapText} onChange={(event) => setValueMapText(event.target.value)} placeholder='{"Kırmızı":"Red"}' /></Field>
    </div>
  );
}

function VariantMappingPanel({ rows, form, setValue, save, loading, selectedCategoryRow }) {
  const [autoMessage, setAutoMessage] = useState('');
  const autoFill = () => {
    setValue('variant_key', 'renk');
    setValue('marketplace_attribute_name', 'Renk');
    setValue('source_field', 'renk');
    setAutoMessage('Renk alanı renk kaynağına hazırlandı. Beden ve numara için satırları ayrı kaydedin.');
  };
  const defaults = [
    { key: 'renk', label: 'Renk' },
    { key: 'beden', label: 'Beden' },
    { key: 'numara', label: 'Numara' },
  ];
  return (
    <div className="mapping-full-panel">
      <div className="mapping-panel-title"><span>Varyant Eşleştirme</span><strong>{selectedCategoryRow?.local_category_name || 'Kategori bağlamı'}</strong></div>
      <p>Seçili kategori: {selectedCategoryRow?.marketplace_category_path || selectedCategoryRow?.marketplace_category_name || 'Kategori seçilmedi'}</p>
      <button type="button" className="secondary-button" onClick={autoFill}>Otomatik Eşleştir</button>
      {autoMessage && <div className="balina-flow-hint compact"><CheckCircle2 size={16} /><span>{autoMessage}</span></div>}
      <div className="variant-field-grid">
        {defaults.map((item) => {
          const mapped = rows.find((row) => row.variant_key === item.key && row.status === 'active');
          return (
            <form className={mapped ? 'variant-field-card ready' : 'variant-field-card'} key={item.key} onSubmit={save}>
              <strong>{item.label}</strong>
              <span>{mapped ? 'Tamamlandı' : 'Eksik'}</span>
              <input value={form.variant_key === item.key ? form.marketplace_attribute_name || '' : mapped?.marketplace_attribute_name || ''} onChange={(event) => { setValue('variant_key', item.key); setValue('marketplace_attribute_name', event.target.value); setValue('source_type', 'variant_field'); setValue('source_field', item.key); }} placeholder={`${item.label} attribute karşılığı`} />
              <button disabled={loading}><Save size={15} /> Kaydet</button>
            </form>
          );
        })}
      </div>
    </div>
  );
}

function ReadinessPanel({ rows, load, readyCount, blockedCount }) {
  const groups = [
    { key: 'ready', label: 'Hazır', rows: rows.filter((row) => row.readiness_status === 'ready'), href: '/products/publish-wizard' },
    { key: 'category', label: 'Kategori eksik', rows: rows.filter((row) => row.missing_category_mapping), href: '/marketplace-mapping?step=categories' },
    { key: 'brand', label: 'Marka eksik', rows: rows.filter((row) => row.missing_brand_mapping), href: '/marketplace-mapping?step=brands' },
    { key: 'attributes', label: 'Nitelik eksik', rows: rows.filter((row) => (row.missing_required_attributes || []).length > 0), href: '/marketplace-mapping?step=attributes' },
    { key: 'variants', label: 'Varyant eksik', rows: rows.filter((row) => (row.missing_variant_attributes || []).length > 0), href: '/marketplace-mapping?step=variants' },
    { key: 'blocked', label: 'Blocked', rows: rows.filter((row) => row.readiness_status === 'blocked'), href: '/marketplace-mapping?step=categories' },
  ];
  return (
    <div className="mapping-full-panel">
      <div className="mapping-panel-title"><span>Hazırlık Kontrolü</span><strong>{readyCount} hazır / {blockedCount} blocked</strong></div>
      <div className="readiness-group-grid">
        {groups.map((group) => (
          <section className="readiness-group-card" key={group.key}>
            <header><strong>{group.label}</strong><span>{group.rows.length}</span></header>
            <div className="readiness-mini-list">
              {group.rows.slice(0, 5).map((row) => <div key={`${group.key}-${row.id || row.sku}`}><strong>{row.name || row.sku}</strong><small>{readinessReason(row)}</small></div>)}
              {group.rows.length === 0 && <small>Bu grupta ürün yok.</small>}
            </div>
            <Link className="table-action-link" to={group.href}>{group.key === 'ready' ? 'Toplu gönderime geç' : 'Eksikleri düzelt'}</Link>
          </section>
        ))}
      </div>
      <div className="wizard-actions inline-actions"><button type="button" className="secondary-button" onClick={load}><RefreshCw size={16} /> Hazırlığı yeniden kontrol et</button><Link className="button-link" to="/products/publish-wizard"><Send size={16} /> Hazır ürünleri gönder</Link></div>
    </div>
  );
}

const customerAttributeFields = [
  { key: 'cargo', label: 'Kargo Firmasi', required: true },
  { key: 'brand', label: 'Marka', required: true },
  { key: 'size', label: 'Boyut/Ebat', required: false },
  { key: 'color', label: 'Renk', required: false },
  { key: 'gender', label: 'Cinsiyet', required: false },
  { key: 'material', label: 'Materyal', required: false },
  { key: 'piece_count', label: 'Parca Sayisi', required: false },
  { key: 'age_group', label: 'Yas Grubu', required: false },
];

function MappingTable({ activeTab, rows, onSelect }) {
  if (activeTab === 'categories') {
    return (
      <DataTable rows={rows} emptyTitle="Kategori eslesmesi yok" emptyText="Ilk kategori eslesmesini sag panelden kaydedin." columns={[
        { key: 'local_category_name', label: 'Ic kategori' },
        { key: 'marketplace_category_id', label: 'Pazaryeri kategori ID', render: (row) => row.marketplace_category_id || '-' },
        { key: 'marketplace_category_name', label: 'Pazaryeri kategori', render: (row) => row.marketplace_category_name || '-' },
        { key: 'marketplace_category_path', label: 'Kategori yolu', render: (row) => row.marketplace_category_path || '-' },
        { key: 'confidence', label: 'Guven', render: (row) => row.confidence || '-' },
        { key: 'status', label: 'Durum', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'action', label: 'Aksiyon', render: (row) => <button type="button" className="table-action-link" onClick={() => onSelect(row)}>Detay</button> },
      ]} />
    );
  }
  if (activeTab === 'brands') {
    return (
      <DataTable rows={rows} emptyTitle="Marka eslesmesi yok" emptyText="Ic markalari pazaryeri marka karsiliklariyla eslestirin." columns={[
        { key: 'local_brand_name', label: 'Ic marka' },
        { key: 'marketplace_brand_id', label: 'Pazaryeri marka ID', render: (row) => row.marketplace_brand_id || '-' },
        { key: 'marketplace_brand_name', label: 'Pazaryeri marka', render: (row) => row.marketplace_brand_name || '-' },
        { key: 'confidence', label: 'Guven', render: (row) => row.confidence || '-' },
        { key: 'status', label: 'Durum', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'action', label: 'Aksiyon', render: (row) => <button type="button" className="table-action-link" onClick={() => onSelect(row)}>Detay</button> },
      ]} />
    );
  }
  if (activeTab === 'attributes') {
    return (
      <DataTable rows={rows} emptyTitle="Nitelik eslesmesi yok" emptyText="Zorunlu ve opsiyonel pazaryeri attribute kaynaklarini tanimlayin." columns={[
        { key: 'marketplace_category_id', label: 'Kategori ID', render: (row) => row.marketplace_category_id || '-' },
        { key: 'marketplace_attribute_id', label: 'Attribute ID' },
        { key: 'marketplace_attribute_name', label: 'Attribute adi' },
        { key: 'required', label: 'Zorunlu', render: (row) => row.required ? 'Evet' : 'Hayir' },
        { key: 'source_type', label: 'Kaynak tipi' },
        { key: 'source_field', label: 'Kaynak alan', render: (row) => row.source_field || '-' },
        { key: 'status', label: 'Durum', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'action', label: 'Aksiyon', render: (row) => <button type="button" className="table-action-link" onClick={() => onSelect(row)}>Detay</button> },
      ]} />
    );
  }
  if (activeTab === 'variants') {
    return (
      <DataTable rows={rows} emptyTitle="Varyant eslesmesi yok" emptyText="Renk, beden, numara gibi varyant anahtarlarini pazaryeri attribute alanlarina baglayin." columns={[
        { key: 'variant_key', label: 'Variant key' },
        { key: 'marketplace_attribute_id', label: 'Attribute ID' },
        { key: 'marketplace_attribute_name', label: 'Attribute adi' },
        { key: 'source_field', label: 'Kaynak alan', render: (row) => row.source_field || row.variant_key },
        { key: 'status', label: 'Durum', render: (row) => <StatusBadge status={row.status} /> },
        { key: 'action', label: 'Aksiyon', render: (row) => <button type="button" className="table-action-link" onClick={() => onSelect(row)}>Detay</button> },
      ]} />
    );
  }

  return (
    <DataTable rows={rows} emptyTitle="Hazirlik eksigi yok" emptyText="Preview icin urun bulunamadi veya tum urunler hazir gorunuyor." columns={[
      { key: 'name', label: 'Urun', render: (row) => <div className="table-product-title"><strong>{row.name}</strong><span>{row.sku}</span></div> },
      { key: 'marketplace_code', label: 'Pazaryeri' },
      { key: 'missing_category_mapping', label: 'Kategori', render: (row) => row.missing_category_mapping ? 'Eksik' : 'Tamam' },
      { key: 'missing_brand_mapping', label: 'Marka', render: (row) => row.missing_brand_mapping ? 'Eksik' : 'Tamam' },
      { key: 'missing_required_attributes', label: 'Nitelik', render: (row) => row.missing_required_attributes?.join(', ') || '-' },
      { key: 'missing_variant_attributes', label: 'Varyant', render: (row) => row.missing_variant_attributes?.join(', ') || '-' },
      { key: 'readiness_status', label: 'Durum', render: (row) => <StatusBadge status={row.readiness_status} /> },
      { key: 'fix', label: 'Yonlendirme', render: (row) => readinessFixLinks(row).length > 0 ? <Link className="table-action-link" to={readinessFixLinks(row)[0].to}>{readinessFixLinks(row)[0].label}</Link> : '-' },
      { key: 'action', label: 'Aksiyon', render: (row) => <button type="button" className="table-action-link" onClick={() => onSelect(row)}>Detay</button> },
    ]} />
  );
}

function MappingForm({ activeTab, form, setValue, companies, localCategories, localBrands, catalogAttributes, providerCategories = [], providerBrands = [], valueMapText, setValueMapText }) {
  const companySelect = (
    <Field label="Firma">
      <select value={form.company_id || ''} onChange={(event) => setValue('company_id', event.target.value)}>
        <option value="">Firma seciniz</option>
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </select>
    </Field>
  );
  const statusSelect = (
    <Field label="Durum">
      <select value={form.status || 'active'} onChange={(event) => setValue('status', event.target.value)}>
        {statusOptions.map((status) => <option key={status} value={status}>{mappingStatusLabel(status)}</option>)}
      </select>
    </Field>
  );

  if (activeTab === 'categories') {
    return (
      <>
        {companySelect}
        <Field label="Ic kategori">
          <input list="mapping-local-categories" value={form.local_category_name || ''} onChange={(event) => setValue('local_category_name', event.target.value)} />
          <datalist id="mapping-local-categories">{localCategories.map((item) => <option key={item} value={item} />)}</datalist>
        </Field>
        <Field label="Pazaryeri kategori ID"><input value={form.marketplace_category_id || ''} onChange={(event) => setValue('marketplace_category_id', event.target.value)} /></Field>
        <Field label="Pazaryeri kategori adi"><input value={form.marketplace_category_name || ''} onChange={(event) => setValue('marketplace_category_name', event.target.value)} /></Field>
        <Field label="Kategori yolu / breadcrumb">
          <input
            list="mapping-provider-categories"
            value={form.marketplace_category_path || ''}
            onChange={(event) => {
              const value = event.target.value;
              const match = providerCategories.find((item) => [item.path, item.name, item.external_id].map(String).includes(String(value)));
              setValue('marketplace_category_path', match?.path || value);
              setValue('marketplace_category_name', match?.name || value);
              if (match) {
                setValue('marketplace_category_id', match.external_id || '');
                setValue('confidence', 'catalog');
              }
            }}
          />
          <datalist id="mapping-provider-categories">{providerCategories.map((item) => <option key={item.external_id} value={item.path || item.name}>{item.external_id}</option>)}</datalist>
        </Field>
        <Field label="Guven"><input value={form.confidence || ''} onChange={(event) => setValue('confidence', event.target.value)} placeholder="exact, normalized, manual" /></Field>
        {statusSelect}
      </>
    );
  }
  if (activeTab === 'brands') {
    return (
      <>
        {companySelect}
        <Field label="Ic marka">
          <input list="mapping-local-brands" value={form.local_brand_name || ''} onChange={(event) => setValue('local_brand_name', event.target.value)} />
          <datalist id="mapping-local-brands">{localBrands.map((item) => <option key={item} value={item} />)}</datalist>
        </Field>
        <Field label="Pazaryeri marka ID"><input value={form.marketplace_brand_id || ''} onChange={(event) => setValue('marketplace_brand_id', event.target.value)} /></Field>
        <Field label="Pazaryeri marka adi">
          <input
            list="mapping-provider-brands"
            value={form.marketplace_brand_name || ''}
            onChange={(event) => {
              const value = event.target.value;
              const match = providerBrands.find((item) => item.name === value || String(item.external_id) === String(value));
              setValue('marketplace_brand_name', match?.name || value);
              if (match) {
                setValue('marketplace_brand_id', match.external_id || '');
                setValue('confidence', 'catalog');
              }
            }}
          />
          <datalist id="mapping-provider-brands">{providerBrands.map((item) => <option key={`${item.external_id || item.name}`} value={item.name}>{item.external_id}</option>)}</datalist>
        </Field>
        <Field label="Guven"><input value={form.confidence || ''} onChange={(event) => setValue('confidence', event.target.value)} placeholder="exact, contains, manual" /></Field>
        {statusSelect}
      </>
    );
  }
  if (activeTab === 'attributes') {
    return (
      <>
        {companySelect}
        <Field label="Pazaryeri kategori ID"><input value={form.marketplace_category_id || ''} onChange={(event) => setValue('marketplace_category_id', event.target.value)} /></Field>
        <Field label="Attribute ID"><input value={form.marketplace_attribute_id || ''} onChange={(event) => setValue('marketplace_attribute_id', event.target.value)} /></Field>
        <Field label="Attribute adi">
          <input list="mapping-attributes" value={form.marketplace_attribute_name || ''} onChange={(event) => setValue('marketplace_attribute_name', event.target.value)} />
          <datalist id="mapping-attributes">{catalogAttributes.map((item) => <option key={item.id || item.name} value={item.name} />)}</datalist>
        </Field>
        <label className="check-row"><input type="checkbox" checked={Boolean(form.required)} onChange={(event) => setValue('required', event.target.checked)} /> Zorunlu attribute</label>
        <Field label="Value type"><input value={form.value_type || ''} onChange={(event) => setValue('value_type', event.target.value)} /></Field>
        <Field label="Source type">
          <select value={form.source_type || 'product_field'} onChange={(event) => setValue('source_type', event.target.value)}>
            {sourceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </Field>
        <Field label="Source field"><input value={form.source_field || ''} onChange={(event) => setValue('source_field', event.target.value)} placeholder="brand, color, variant_attributes.renk" /></Field>
        <Field label="Fixed value"><input value={form.fixed_value || ''} onChange={(event) => setValue('fixed_value', event.target.value)} /></Field>
        <Field label="Value map JSON"><textarea value={valueMapText} onChange={(event) => setValueMapText(event.target.value)} placeholder='{"Kirmizi":"Red"}' /></Field>
        {statusSelect}
      </>
    );
  }

  return (
    <>
      {companySelect}
      <Field label="Variant key">
        <select value={form.variant_key || 'renk'} onChange={(event) => setValue('variant_key', event.target.value)}>
          {variantKeys.map((key) => <option key={key} value={key}>{key}</option>)}
        </select>
      </Field>
      <Field label="Marketplace attribute ID"><input value={form.marketplace_attribute_id || ''} onChange={(event) => setValue('marketplace_attribute_id', event.target.value)} /></Field>
      <Field label="Marketplace attribute adi"><input value={form.marketplace_attribute_name || ''} onChange={(event) => setValue('marketplace_attribute_name', event.target.value)} /></Field>
      <Field label="Source field"><input value={form.source_field || ''} onChange={(event) => setValue('source_field', event.target.value)} placeholder="renk, beden" /></Field>
      <Field label="Value map JSON"><textarea value={valueMapText} onChange={(event) => setValueMapText(event.target.value)} placeholder='{"XL":"Extra Large"}' /></Field>
      {statusSelect}
    </>
  );
}

function ReadinessDetail({ row }) {
  if (!row) {
    return <div className="soft-empty">Hazirlik satiri secildiginde eksik nedenleri ve etkilenen alanlar burada gorunur.</div>;
  }

  return (
    <div className="mapping-readiness-detail">
      <div className="mapping-ready-card">
        <strong>{row.readiness_status === 'ready' ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}</strong>
        <span>{row.name} / {row.sku}</span>
      </div>
      <div className="detail-grid compact-detail-grid">
        <div className="detail-card"><span>Kategori</span><strong>{row.missing_category_mapping ? 'Eksik' : 'Tamam'}</strong></div>
        <div className="detail-card"><span>Marka</span><strong>{row.missing_brand_mapping ? 'Eksik' : 'Tamam'}</strong></div>
        <div className="detail-card"><span>Nitelik</span><strong>{row.missing_required_attributes?.length || 0}</strong></div>
        <div className="detail-card"><span>Varyant</span><strong>{row.missing_variant_attributes?.length || 0}</strong></div>
      </div>
      <div className="soft-empty"><strong>Nedenler</strong><span>{readinessReason(row)}</span></div>
      <div className="quick-fix-strip mapping-fix-strip">
        {readinessFixLinks(row).length === 0 ? <span className="status-pill ready">Yayina hazir</span> : readinessFixLinks(row).map((link) => <Link className="button-link secondary-link" to={link.to} key={link.to}>{link.label}</Link>)}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const ready = ['active', 'ready'].includes(status);
  const blocked = ['blocked', 'unmapped', 'passive'].includes(status);
  return <span className={ready ? 'status-pill ready' : blocked ? 'status-pill blocked' : 'status-pill'}>{mappingStatusLabel(status)}</span>;
}
