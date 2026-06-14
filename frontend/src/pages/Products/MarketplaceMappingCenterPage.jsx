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
  attribute: 'attributes',
  attributes: 'attributes',
  variant: 'variants',
  variants: 'variants',
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
      if (!singleTab) {
        setWorkflowModal(stepParam);
        setWorkflowDetail(null);
      }
    }
  }, [searchParams, singleTab]);

  useEffect(() => {
    resetForm(activeTab);
  }, [activeTab, marketplaceCode, defaultCompanyId]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

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

const workflowTabs = ['Pazaryeri Eslestirmeleri', 'Urun Yorumlari', 'Urun Onerileri', 'Toplu Urun Islemleri'];

const workflowSteps = [
  {
    key: 'categories',
    no: 1,
    title: 'Kategori Eslestir',
    description: 'Mevcut kategorilerinizi pazaryerindeki kategoriler ile eslestirebilirsiniz.',
    fields: ['Eslestirilecek Kategori', 'Platform', 'Durum'],
    button: 'Eslestirmeye Basla',
  },
  {
    key: 'attributes',
    no: 2,
    title: 'Ozellik Eslestir',
    description: 'Eslesmesi tamamlanan kategorilerinizin pazaryeri ozelliklerini de eslestirebilirsiniz. Zorunlu ozellikleri doldurmaniz urun listeleme islemlerinizi hizlandirmaktadir.',
    fields: ['Eslestirilecek Kategori', 'Platform'],
    button: 'Eslestirmeye Basla',
  },
  {
    key: 'variants',
    no: 3,
    title: 'Varyant Eslestir',
    description: 'Eslesmesi tamamlanan kategorilerinizin varyantlarini da eslestirebilirsiniz.',
    fields: ['Eslestirilecek Kategori', 'Platform'],
    button: 'Eslestirmeye Basla',
  },
];

function workflowModalTitle(tab, marketplaceCode) {
  const provider = marketplaceCode === 'hepsiburada' ? 'Hepsiburada' : 'Trendyol';
  if (tab === 'categories') return `${provider} Kategori Eslestirme`;
  if (tab === 'attributes') return `${provider} Ozellik Eslestirme`;
  if (tab === 'variants') return `${provider} Varyant Eslestirme`;
  return 'Pazaryeri Eslestirme';
}

function workflowModalInfo(tab) {
  if (tab === 'categories') {
    return {
      info: 'Urunlerinizi gondereceginiz pazaryeri kategorilerini secin.',
      warning: 'Ilgili pazaryeri eslestirmelerini otomatik olarak kaydeder. Hangi kategoriye gondermek istediginizi secmeniz gerekir.',
    };
  }
  if (tab === 'attributes') {
    return {
      info: 'Eslestirme Durumu daha once eslestirdiginiz ozelliklerin sayisini gostermektedir.',
      warning: 'Ilgili kategori icerisinde varyant degerleriniz varsa ozellik kisminda bulunan varyant bilgilerini eslestirmemeniz gerekir.',
    };
  }
  return {
    info: 'Secilen kategoriye ait tum varyantlar asagida listelenmektedir.',
    warning: 'Renk, beden ve numara gibi varyant alanlarini pazaryeri attribute karsiliklariyla eslestirin.',
  };
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
  workflowModal,
  openWorkflowModal,
  closeWorkflowModal,
  activeTab,
  visibleRows,
  selectRow,
  selected,
  form,
  setValue,
  save,
  loadingAction,
  companies,
  localCategories,
  localBrands,
  catalogAttributes,
  providerCategories,
  providerBrands,
  providerAttributesByCategory,
  loadProviderAttributes,
  refreshProviderAttributes,
  cacheStatus,
  canManageCatalog,
  syncLoading,
  syncProviderCatalog,
  valueMapText,
  setValueMapText,
  workflowDetail,
  setWorkflowDetail,
  switchWorkflowModal,
}) {
  const navigate = useNavigate();
  const modalCopy = workflowModalInfo(workflowModal);
  const modalRows = workflowModal ? visibleRows : [];
  const mappedCategories = rows.categories.filter(isMappedCategory);
  const workflowCategoryRows = mappedCategories.length > 0 ? mappedCategories : [];
  const categoryComplete = mappedCategories.length > 0 && Number(summary?.unmapped_category_count || 0) === 0;
  const categoryStarted = mappedCategories.length > 0;
  const attributeComplete = categoryStarted && requiredAttributes.length > 0 && Number(summary?.missing_required_attribute_count || 0) === 0;
  const attributeStarted = rows.attributes.length > 0;
  const variantComplete = categoryStarted && rows.variants.length > 0 && Number(missingVariantCount || 0) === 0;
  const stepStates = {
    categories: categoryComplete ? 'complete' : 'missing',
    attributes: !categoryStarted ? 'pending' : attributeComplete ? 'complete' : 'missing',
    variants: !categoryStarted ? 'pending' : variantComplete ? 'complete' : 'missing',
  };
  const stepNotes = {
    categories: categoryStarted ? `${mappedCategories.length} kategori eslesmis` : 'Once kategori secin',
    attributes: !categoryStarted ? 'Kategori bekleniyor' : attributeStarted ? `${requiredAttributes.length} zorunlu alan tanimli` : 'Ozellik eslesmesi eksik',
    variants: !categoryStarted ? 'Kategori bekleniyor' : attributeStarted ? `${rows.variants.length} varyant eslesmesi` : 'Once ozellik eslestirmesi onerilir',
  };
  const roadmapSteps = [
    { key: 'categories', no: 1, title: 'Kategori', note: stepNotes.categories, action: 'Kategori eslestir' },
    { key: 'attributes', no: 2, title: 'Ozellik', note: stepNotes.attributes, action: 'Ozellik eslestir' },
    { key: 'variants', no: 3, title: 'Varyant', note: stepNotes.variants, action: 'Varyant eslestir' },
    { key: 'publish', no: 4, title: 'Urun Gonder', note: variantComplete ? 'Gonderime hazir' : 'Eslesmeleri kontrol edin', action: 'Urun gonder' },
  ];

  return (
    <>
      <PageHeader
        title="Pazaryeri Eslestirmeleri"
        description="Urunlerinizi pazaryerlerine gönderebilmek için aşağıdaki adımları sırayla tamamlayın."
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

      <section className="reference-tabs">
        {['Pazaryeri Eslestirmeleri', 'Kategori Yonetimi', 'Marka Yonetimi', 'Nitelik Yonetimi', 'Toplu Pazaryeri Islemleri', 'Pazaryeri Monitoru'].map((item) => (
          <Link
            className={item === 'Pazaryeri Eslestirmeleri' ? 'active' : ''}
            to={item === 'Toplu Pazaryeri Islemleri' ? '/products/publish-wizard' : item === 'Pazaryeri Monitoru' ? '/products/publish-queue' : '/marketplace-mapping'}
            key={item}
          >
            {item}
          </Link>
        ))}
      </section>

      <section className="reference-info-strip">
        <CheckCircle2 size={18} />
        <div>
          <strong>Pazaryeri eslestirmeleri ile urunlerinizi Trendyol ve Hepsiburada kategorilerine hazirlayabilirsiniz.</strong>
          <span>Sıradaki işlem: {!categoryStarted ? 'kategori eşleştirme' : !attributeStarted ? 'özellik eşleştirme' : !variantComplete ? 'varyant eşleştirme' : 'ürün gönderme'}.</span>
        </div>
      </section>

      <section className="marketplace-roadmap-shell reference-operation-panel">
        <div className="marketplace-roadmap-heading">
          <div>
            <span>Filtreleme Secenekleri</span>
            <strong>{!categoryStarted ? 'Kategori eslestirmeyi tamamlayin' : !attributeStarted ? 'Ozellikleri eslestirin' : !variantComplete ? 'Varyantlari kontrol edin' : 'Urunleri gonderime alin'}</strong>
          </div>
          <Link className="button-link" to="/products/publish-wizard"><Send size={16} /> Urun gonder</Link>
        </div>
        <div className="marketplace-workflow-roadmap">
          {roadmapSteps.map((step, index) => {
            const state = step.key === 'publish' ? (variantComplete ? 'complete' : 'pending') : stepStates[step.key];
            const disabled = step.key !== 'categories' && step.key !== 'publish' && !categoryStarted;
            return (
              <div className="marketplace-roadmap-segment" key={step.key}>
                <button
                  type="button"
                  className={`marketplace-roadmap-step ${stepStatusClass(state)}`}
                  disabled={disabled}
                  onClick={() => (step.key === 'publish' ? navigate('/products/publish-wizard') : openWorkflowModal(step.key))}
                >
                  <span>{step.no}</span>
                  <strong>{step.title}</strong>
                  <small>{stepStatusLabel(state)}</small>
                  <em>{step.note}</em>
                </button>
                {index < roadmapSteps.length - 1 && <span className="roadmap-arrow">{'>'}</span>}
              </div>
            );
          })}
        </div>
        <div className="marketplace-flow-alert compact reference-warning-line">
          <AlertTriangle size={18} />
          <strong>Her adim bir sonrakini acar. Eksik olan karttan baslayin, kaydedin ve sonraki adima gecin.</strong>
        </div>
      </section>

      <details className="marketplace-flow-advanced">
        <summary>Gelismis teknik gorunum ve katalog cache</summary>
        <CatalogCacheStatusPanel
          marketplaceCode={marketplaceCode}
          cacheStatus={cacheStatus}
          canManageCatalog={canManageCatalog}
          syncLoading={syncLoading}
          onSyncCategories={() => syncProviderCatalog('categories')}
          onSyncBrands={() => syncProviderCatalog('brands')}
          onSyncAttributes={() => syncProviderCatalog('attributes')}
        />
        <div className="quick-fix-strip">
          <Link className="button-link secondary-link" to="/marketplace-readiness">Hazirlik</Link>
          <Link className="button-link secondary-link" to="/marketplace-mapping/categories">Kategori detay</Link>
          <Link className="button-link secondary-link" to="/marketplace-mapping/brands">Marka detay</Link>
          <Link className="button-link secondary-link" to="/marketplace-mapping/attributes">Ozellik detay</Link>
          <Link className="button-link secondary-link" to="/marketplace-mapping/variants">Varyant detay</Link>
        </div>
      </details>

      {workflowModal && (
        <div className="workflow-modal-backdrop" role="presentation">
          <section className="workflow-modal" role="dialog" aria-modal="true" aria-label={workflowModalTitle(workflowModal, marketplaceCode)}>
            <header className="workflow-modal-header">
              <div>
                <span>{marketplaceCode === 'hepsiburada' ? 'Hepsiburada' : 'Trendyol'}</span>
                <h2>{workflowModalTitle(workflowModal, marketplaceCode)}</h2>
                <p>{modalCopy.info}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Kapat" onClick={closeWorkflowModal}><X size={18} /></button>
            </header>
            <div className="workflow-modal-warning">
              <AlertTriangle size={17} />
              <span>{modalCopy.warning}</span>
            </div>
            <div className="workflow-modal-toolbar">
              <div className="customer-modal-guide">
                <PackageCheck size={18} />
                <span>{workflowModal === 'categories' ? 'Ic kategoriyi pazaryeri kategorisiyle eslestir, kaydet ve ozellik adimina gec.' : workflowModal === 'attributes' ? 'Secili kategorinin zorunlu alanlarini tamamla. Marka bilgisi burada ozellikle kontrol edilir.' : 'Renk, beden ve numara gibi varyant alanlarini pazaryeri karsiliklariyla eslestir.'}</span>
              </div>
              <span className="customer-modal-count">{modalRows.length || workflowCategoryRows.length || 0} kayit</span>
            </div>
            <CustomerMappingModalBody
              tab={workflowModal}
              rows={workflowModal === 'categories' ? modalRows : workflowCategoryRows}
              attributeRows={rows.attributes}
              variantRows={rows.variants}
              selected={selected}
              selectRow={selectRow}
              setWorkflowDetail={setWorkflowDetail}
              workflowDetail={workflowDetail}
              form={form}
              setValue={setValue}
              save={save}
              loading={loadingAction}
              marketplaceCode={marketplaceCode}
              providerCategories={providerCategories}
              providerBrands={providerBrands}
              providerAttributesByCategory={providerAttributesByCategory}
              loadProviderAttributes={loadProviderAttributes}
              refreshProviderAttributes={refreshProviderAttributes}
              cacheStatus={cacheStatus}
              canManageCatalog={canManageCatalog}
              syncLoading={syncLoading}
              syncProviderCatalog={syncProviderCatalog}
              closeWorkflowModal={closeWorkflowModal}
              switchWorkflowModal={switchWorkflowModal}
              attributeStarted={attributeStarted}
            />
          </section>
        </div>
      )}
    </>
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

function CustomerMappingModalBody({
  tab,
  rows,
  attributeRows,
  variantRows,
  selected,
  selectRow,
  setWorkflowDetail,
  workflowDetail,
  form,
  setValue,
  save,
  loading,
  marketplaceCode,
  providerCategories = [],
  providerBrands = [],
  providerAttributesByCategory = {},
  loadProviderAttributes,
  refreshProviderAttributes,
  cacheStatus,
  canManageCatalog,
  syncLoading,
  syncProviderCatalog,
  closeWorkflowModal,
  switchWorkflowModal,
  attributeStarted,
}) {
  const provider = marketplaceCode === 'hepsiburada' ? 'Hepsiburada' : 'Trendyol';
  const categoryRows = rows.filter((row) => tab === 'categories' || isMappedCategory(row)).slice(0, 10);
  const selectProviderCategory = (row, value) => {
    const match = providerCategories.find((item) => [item.path, item.name, item.external_id].map(String).includes(String(value)));
    if (selected?.id !== row.id) selectRow(row);
    setValue('marketplace_category_path', match?.path || value);
    setValue('marketplace_category_name', match?.name || value);
    setValue('marketplace_category_id', match?.external_id || '');
    setValue('confidence', match ? 'catalog' : form.confidence);
  };

  if (tab === 'categories') {
    return (
      <div className="customer-modal-stack">
        {providerCategories.length === 0 && (
          <div className="catalog-cache-empty inline">
            <AlertTriangle size={16} />
            <p>Henüz pazaryeri kategori verisi bulunmuyor. Kategorileri Güncelle butonuyla Trendyol’dan kategori listesini çekin.</p>
          </div>
        )}
        <div className="customer-modal-count">Sayfada {categoryRows.length || 0} kayit gosteriliyor.</div>
        <table className="customer-simple-table">
          <thead>
            <tr>
              <th>Urun kategorisi</th>
              <th>Pazaryeri Kategorisi</th>
              <th>Sonuc</th>
              <th>Islem</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.length === 0 ? (
              <tr><td colSpan="4">Kategori kaydi bulunamadi.</td></tr>
            ) : categoryRows.map((row, index) => (
              <tr key={row.id || row.local_category_name || index}>
                <td>
                  <strong>{row.local_category_name || row.category || '-'}</strong>
                  <span>Kaynak: urun kategorisi</span>
                </td>
                <td>
                  <input list="provider-category-cache-options" value={selected?.id === row.id ? form.marketplace_category_path || form.marketplace_category_name || '' : row.marketplace_category_path || row.marketplace_category_name || ''} onChange={(event) => selectProviderCategory(row, event.target.value)} placeholder={`${provider} kategori yolu secin`} />
                  <datalist id="provider-category-cache-options">
                    {providerCategories.slice(0, 200).map((item) => <option key={item.external_id} value={item.path || item.name}>{item.external_id} - {item.name}</option>)}
                  </datalist>
                  {(selected?.id === row.id ? form.marketplace_category_id : row.marketplace_category_id) && (
                    <small className="catalog-cache-hint">Kategori ID: {selected?.id === row.id ? form.marketplace_category_id : row.marketplace_category_id}</small>
                  )}
                </td>
                <td><span className={`workflow-step-status ${isMappedCategory(row) ? 'ready' : 'blocked'}`}>{isMappedCategory(row) ? 'Tamamlandi' : 'Eksik'}</span></td>
                <td><button type="button" className="warning-button compact-warning-button" onClick={() => selectRow(row)}>Bu kategoriyi sec</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wizard-actions inline-actions">
          <button type="button" className="secondary-button" onClick={closeWorkflowModal}>Kapat</button>
          <button type="button" disabled={loading || !selected} onClick={save}><Save size={16} /> Kaydet</button>
          {selected && <button type="button" className="success-button" onClick={() => switchWorkflowModal('attributes')}>Ozellik eslestirmeye gec</button>}
        </div>
      </div>
    );
  }

  if (tab === 'attributes') {
    const attributeCount = (category) => attributeRows.filter((row) => String(row.marketplace_category_id || '') === String(category.marketplace_category_id || '')).length;
    const selectedCategoryId = workflowDetail?.marketplace_category_id ? String(workflowDetail.marketplace_category_id) : '';
    const selectedAttributeRows = workflowDetail ? attributeRows.filter((row) => String(row.marketplace_category_id || '') === selectedCategoryId) : [];
    const providerAttributeRows = selectedCategoryId ? providerAttributesByCategory[selectedCategoryId] || [] : [];
    const attributeCacheLastSyncedAt = selectedCategoryId === cacheStatus?.attributes.categoryId ? cacheStatus.attributes.lastSyncedAt : latestSyncedAt(providerAttributeRows);
    const checklistFields = providerAttributeRows.length > 0
      ? providerAttributeRows
        .map((attribute) => ({
          key: attribute.external_id,
          label: attribute.name,
          required: Boolean(attribute.required),
          valueType: attribute.value_type,
          allowCustom: Boolean(attribute.allow_custom),
          providerAttribute: true,
        }))
        .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)))
      : customerAttributeFields;
    const hasAttribute = (field) => selectedAttributeRows.some((row) => String(row.marketplace_attribute_id || '') === String(field.key) || normalize(row.marketplace_attribute_name).includes(normalize(field.label)));
    const openAttributes = async (row) => {
      setWorkflowDetail(row);
      setValue('local_category_id', row.local_category_id || '');
      setValue('marketplace_category_id', row.marketplace_category_id || '');
      if (row.marketplace_category_id && loadProviderAttributes) {
        await loadProviderAttributes(row.marketplace_category_id);
      }
    };
    return (
      <div className="customer-modal-stack">
        <table className="customer-simple-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Pazaryeri Kategorisi</th>
              <th>Eksik / Tamam</th>
              <th>Devam et</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.length === 0 ? (
              <tr><td colSpan="4">Ozellik eslestirmek icin once kategori eslestirmesini tamamlayin.</td></tr>
            ) : categoryRows.map((row, index) => (
              <tr key={row.id || index}>
                <td><strong>{row.local_category_name || '-'}</strong></td>
                <td><span>{row.marketplace_category_path || row.marketplace_category_name || '-'}</span></td>
                <td>{attributeCount(row)} / {Math.max(attributeCount(row), (providerAttributesByCategory[row.marketplace_category_id] || customerAttributeFields).length)}</td>
                <td><button type="button" className="warning-button compact-warning-button" onClick={() => openAttributes(row)}>Alanlari ac</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {workflowDetail && (
          <section className="customer-sub-modal">
            <h3>Ozellik Eslestir</h3>
            <p><strong>Kategori:</strong> {workflowDetail.local_category_name}</p>
            <p><strong>Pazaryeri:</strong> {workflowDetail.marketplace_category_path || workflowDetail.marketplace_category_name || '-'}</p>
            {providerAttributeRows.length > 0 && (
              <p><strong>Cache:</strong> {providerAttributeRows.filter((item) => item.required).length} zorunlu / {providerAttributeRows.length} toplam nitelik</p>
            )}
            <div className="catalog-cache-modal-note">
              <div>
                <strong>{providerAttributeRows.length > 0 ? 'Zorunlu nitelikler Trendyol katalog cache’den gelir.' : 'Ornek alanlar gosteriliyor.'}</strong>
                <span>Son guncelleme: {formatCacheDate(attributeCacheLastSyncedAt)}</span>
              </div>
              {canManageCatalog && marketplaceCode === 'trendyol' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={Boolean(syncLoading)}
                  onClick={() => syncProviderCatalog('attributes', selectedCategoryId)}
                >
                  <RefreshCw size={16} /> {syncLoading === 'attributes' ? 'Guncelleniyor...' : 'Ozellikleri Guncelle'}
                </button>
              )}
            </div>
            {providerAttributeRows.length === 0 && (
              <div className="catalog-cache-empty inline">
                <AlertTriangle size={16} />
                <p>Bu kategori için özellik verisi bulunmuyor. Özellikleri Güncelle butonuyla zorunlu nitelikleri çekin.</p>
              </div>
            )}
            <div className="workflow-modal-warning">
              <AlertTriangle size={16} />
              <span>Varyant degerleriniz varsa renk/beden gibi alanlari burada degil, varyant eslestirme ekraninda birakin.</span>
            </div>
            <div className="brand-required-note">
              <strong>Marka zorunludur</strong>
              <span>Marka bilgisi urun listeleme icin zorunludur. Marka eslesmesi olmayan urunler pazaryerinde reddedilebilir.</span>
            </div>
            <div className="customer-checklist">
              {checklistFields.map((field) => (
                <label className={hasAttribute(field) ? 'complete' : 'missing'} key={field.key}>
                  <span>{hasAttribute(field) ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span>
                  <strong>{field.label}{field.required && <b>*</b>}</strong>
                  <small>{hasAttribute(field) ? 'Tamamlandi' : field.valueType ? `${field.valueType} degeri eksik` : 'Eksik'}</small>
                  <input onChange={(event) => { setValue('marketplace_attribute_id', field.providerAttribute ? field.key : form.marketplace_attribute_id); setValue('marketplace_attribute_name', field.label); setValue('required', Boolean(field.required)); setValue('value_type', field.valueType || ''); setValue('fixed_value', event.target.value); setValue('source_type', 'fixed_value'); }} placeholder={`${field.label} secin veya yazin`} />
                </label>
              ))}
            </div>
            <div className="wizard-actions inline-actions">
              <button type="button" className="secondary-button" onClick={() => setWorkflowDetail(null)}>Geri</button>
              <button type="button" disabled={loading} onClick={save}><Save size={16} /> Kaydet</button>
            </div>
          </section>
        )}
      </div>
    );
  }

  const variantStatus = (key) => variantRows.some((row) => row.variant_key === key && row.status === 'active') ? 'Tamam' : 'Bekliyor';
  return (
    <div className="customer-modal-stack">
      <table className="customer-simple-table">
          <thead>
            <tr>
              <th>Kategori</th>
              <th>Pazaryeri Kategorisi</th>
              <th>Renk / Beden</th>
              <th>Devam et</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.length === 0 ? (
              <tr><td colSpan="4">Varyant eslestirmek icin once kategori eslestirmesini tamamlayin.</td></tr>
            ) : categoryRows.map((row, index) => (
              <tr key={row.id || index}>
              <td><strong>{row.local_category_name || '-'}</strong></td>
              <td><span>{row.marketplace_category_path || row.marketplace_category_name || '-'}</span></td>
              <td>{variantStatus('beden')} / {variantStatus('renk')}</td>
              <td><button type="button" className="warning-button compact-warning-button" onClick={() => setWorkflowDetail(row)}>Varyantlari ac</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {workflowDetail && (
        <section className="customer-sub-modal">
          <h3>Varyant Eslestir</h3>
          {!attributeStarted && (
            <div className="workflow-modal-warning">
              <AlertTriangle size={16} />
              <span>Once ilgili kategorinin ozellik eslestirmesini tamamlamaniz onerilir.</span>
            </div>
          )}
          <p><strong>Kategori:</strong> {workflowDetail.local_category_name || '-'}</p>
          <p><strong>Pazaryeri:</strong> {workflowDetail.marketplace_category_path || workflowDetail.marketplace_category_name || '-'}</p>
          <p>Secilen kategoriye ait tum varyantlar asagida listelenmektedir.</p>
          <div className="variant-simple-list">
            {['Boyut/Ebat', 'Renk'].map((label) => {
              const key = label === 'Renk' ? 'renk' : 'beden';
              const complete = variantStatus(key) === 'Tamam';
              return (
                <label className={complete ? 'complete' : 'missing'} key={label}>
                  <span>{complete ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}</span>
                  <strong>{label}</strong>
                  <small>{complete ? 'Tamamlandi' : 'Eksik'}</small>
                  <input onChange={(event) => { setValue('variant_key', key); setValue('marketplace_attribute_name', event.target.value || label); setValue('source_field', key); }} placeholder={`${provider} ${label} karsiligi`} />
                </label>
              );
            })}
          </div>
          <div className="wizard-actions inline-actions">
            <button type="button" className="secondary-button" onClick={() => { setValue('variant_key', 'renk'); setValue('marketplace_attribute_name', 'Renk'); setValue('source_field', 'renk'); }}>Otomatik Eslestir</button>
            <button type="button" disabled={loading} onClick={save}><Save size={16} /> Kaydet</button>
          </div>
        </section>
      )}
    </div>
  );
}

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
