import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Database, Eye, FileSpreadsheet, Link2, PauseCircle, Play, Power, RotateCcw, Save } from 'lucide-react';
import { api, asArray, asObject } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const importFields = {
  sku: 'SKU',
  barcode: 'Barkod',
  name: 'Urun adi',
  price: 'Fiyat',
  stock: 'Stok',
  category: 'Kategori',
  brand: 'Marka',
  description: 'Aciklama',
  image_urls: 'Gorsel',
  list_price: 'Liste fiyati',
  variant_group: 'Varyant grubu',
  variants: 'Varyant alanlari',
};

const requiredFields = ['sku', 'barcode', 'name', 'price', 'stock', 'category', 'brand', 'description', 'image_urls'];

const wizardSteps = [
  'Kaynak Tipi',
  'Kaynak Bilgisi',
  'On Kontrol',
  'Alan Eslestirme',
  'Veri Onizleme',
  'Validasyon',
  'Import Baslat',
  'Sonuc ve Gecmis',
];

const defaultOptions = {
  match_by: 'sku',
  update_existing: true,
  deactivate_missing: false,
  update_stock_price_only: false,
  download_images: false,
  filters: {
    minimum_stock: '',
    minimum_price: '',
    include_categories: '',
    exclude_categories: '',
    exclude_brands: '',
  },
  pricing: {
    source_profit_rate: '',
    price_multiplier: '',
    rounding_mode: 'none',
  },
  transforms: {
    title_prefix: '',
    title_suffix: '',
    strip_html_description: false,
  },
  stock_strategy: {
    missing_product_action: 'none',
  },
  image_strategy: {
    download_images: false,
    max_image_count: 8,
  },
  mappings: {
    categories: {},
    brands: {},
  },
  mapping_behavior: {
    apply_category_mapping: true,
    apply_brand_mapping: true,
  },
};

const xmlInitial = {
  company_id: '',
  name: '',
  supplier_name: '',
  url: '',
  username: '',
  password: '',
  frequency_minutes: 1440,
  is_active: true,
};

function sourceTypeLabel(type) {
  return type === 'xml' ? 'XML URL' : 'Excel dosyasi';
}

function statusLabel(status) {
  return {
    queued: 'Kuyrukta',
    running: 'Calisiyor',
    completed: 'Tamamlandi',
    completed_with_errors: 'Hatalarla tamamlandi',
    failed: 'Basarisiz',
  }[status] || status || '-';
}

function statusClass(status) {
  if (['completed', 'queued'].includes(status)) return 'ready';
  if (status === 'running') return 'running';
  return 'blocked';
}

function runDuration(row) {
  if (!row.started_at && !row.finished_at) return '-';
  return `${row.started_at || '-'} / ${row.finished_at || 'devam ediyor'}`;
}

function mergeOptions(options) {
  const current = asObject(options);

  return {
    ...defaultOptions,
    ...current,
    filters: { ...defaultOptions.filters, ...asObject(current.filters) },
    pricing: { ...defaultOptions.pricing, ...asObject(current.pricing) },
    transforms: { ...defaultOptions.transforms, ...asObject(current.transforms) },
    stock_strategy: {
      ...defaultOptions.stock_strategy,
      ...asObject(current.stock_strategy),
      missing_product_action: asObject(current.stock_strategy).missing_product_action || (current.deactivate_missing ? 'passive_missing' : defaultOptions.stock_strategy.missing_product_action),
    },
    image_strategy: {
      ...defaultOptions.image_strategy,
      ...asObject(current.image_strategy),
      download_images: current.download_images ?? asObject(current.image_strategy).download_images ?? defaultOptions.image_strategy.download_images,
    },
    mappings: {
      categories: { ...defaultOptions.mappings.categories, ...asObject(asObject(current.mappings).categories) },
      brands: { ...defaultOptions.mappings.brands, ...asObject(asObject(current.mappings).brands) },
    },
    mapping_behavior: { ...defaultOptions.mapping_behavior, ...asObject(current.mapping_behavior) },
    download_images: current.download_images ?? asObject(current.image_strategy).download_images ?? defaultOptions.download_images,
  };
}

function appendFormData(formData, key, value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([childKey, childValue]) => appendFormData(formData, `${key}[${childKey}]`, childValue));
    return;
  }

  formData.append(key, value ?? '');
}

function optionListText(value) {
  return Array.isArray(value) ? value.join('\n') : value ?? '';
}

function uniqueMappedValues(rows, field) {
  return [...new Set(rows
    .map((row) => asObject(row?.mapped)[field])
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean))];
}

function normalizeCatalogValue(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function suggestCatalogMatch(source, resources) {
  const raw = String(source || '').trim();
  if (!raw) return null;

  const candidates = resources
    .map((resource) => resource?.name)
    .filter(Boolean)
    .map((name) => String(name).trim())
    .filter(Boolean);
  const exact = candidates.find((name) => name === raw);
  if (exact) return { value: exact, confidence: 'exact', reason: 'Birebir eslesme' };

  const normalizedRaw = normalizeCatalogValue(raw);
  const normalized = candidates.find((name) => normalizeCatalogValue(name) === normalizedRaw);
  if (normalized) return { value: normalized, confidence: 'normalized', reason: 'Normalize edilmis eslesme' };

  const contains = candidates.find((name) => {
    const normalizedName = normalizeCatalogValue(name);
    return normalizedName.includes(normalizedRaw) || normalizedRaw.includes(normalizedName);
  });

  return contains ? { value: contains, confidence: 'contains', reason: 'Dusuk guvenli icerik eslesmesi' } : null;
}

function buildMappingRows(values, mappings, resources) {
  const safeMappings = asObject(mappings);

  return values.map((source) => {
    const mappedValue = safeMappings[source] || '';
    const suggestion = mappedValue ? null : suggestCatalogMatch(source, resources);
    return {
      source,
      mappedValue,
      suggestion,
      status: mappedValue ? 'mapped' : (suggestion ? 'suggested' : 'unmapped'),
    };
  });
}

function mappingStats(rows) {
  return {
    total: rows.length,
    mapped: rows.filter((row) => row.status === 'mapped').length,
    unmapped: rows.filter((row) => row.status === 'unmapped').length,
    suggested: rows.filter((row) => row.status === 'suggested').length,
  };
}

function mappingStatusLabel(status) {
  return {
    mapped: 'Eslesti',
    suggested: 'Oneri var',
    unmapped: 'Eslesmedi',
  }[status] || status;
}

function mappingStatusTone(status) {
  return {
    mapped: 'ready',
    suggested: 'running',
    unmapped: 'blocked',
  }[status] || 'blocked';
}

function filterReasonLabel(reason) {
  return {
    min_stock: 'Minimum stok',
    min_price: 'Minimum fiyat',
    excluded_category: 'Haric kategori',
    excluded_brand: 'Haric marka',
    include_category_miss: 'Dahil kategori disi',
  }[reason] || reason || '-';
}

function stockActionLabel(action) {
  return {
    zero_stock: 'Stok sifirlandi',
    passive: 'Pasife alindi',
  }[action] || action || '-';
}

function withRowIds(rows, prefix) {
  return asArray(rows).map((row, index) => ({ id: `${prefix}-${row.row_number || row.sku || index}`, ...asObject(row) }));
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatDateTime(value) {
  const date = parseDate(value);
  return date ? date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '-';
}

function formatFrequency(minutes) {
  const safeMinutes = Number(minutes) || 1440;
  if (safeMinutes < 60) return `${safeMinutes} dk`;
  if (safeMinutes % 1440 === 0) return `${safeMinutes / 1440} gun`;
  if (safeMinutes % 60 === 0) return `${safeMinutes / 60} saat`;
  return `${safeMinutes} dk`;
}

function getSourceRuns(source, runs) {
  return asArray(runs)
    .filter((run) => Number(run.xml_source_id) === Number(source?.id))
    .sort((a, b) => (parseDate(b.queued_at || b.created_at)?.getTime() || 0) - (parseDate(a.queued_at || a.created_at)?.getTime() || 0));
}

function getLatestSourceRun(source, runs) {
  return getSourceRuns(source, runs)[0] || null;
}

function getRunningSourceRun(source, runs) {
  return getSourceRuns(source, runs).find((run) => ['queued', 'running'].includes(run.status)) || null;
}

function getNextRunAt(source) {
  if (!source?.is_active) return null;
  const last = parseDate(source.last_import_at);
  if (!last) return new Date();
  return new Date(last.getTime() + Math.max(5, Number(source.frequency_minutes) || 1440) * 60 * 1000);
}

function getAutomationStatus(source, runs) {
  if (!source?.is_active) return { key: 'paused', label: 'Pasif', tone: 'blocked' };

  const running = getRunningSourceRun(source, runs);
  if (running?.status === 'running') return { key: 'running', label: 'Calisiyor', tone: 'running' };
  if (running?.status === 'queued') return { key: 'queued', label: 'Kuyrukta', tone: 'running' };
  if (source.last_status === 'failed') return { key: 'error', label: 'Hata', tone: 'blocked' };

  const nextRunAt = getNextRunAt(source);
  if (nextRunAt && nextRunAt <= new Date()) return { key: 'due', label: 'Hazir', tone: 'running' };

  return { key: 'healthy', label: 'Saglikli', tone: 'ready' };
}

function getSourceRunSummary(source, runs) {
  const latest = getLatestSourceRun(source, runs);
  const report = asObject(latest?.report);

  return {
    latest,
    success: latest?.success_count || 0,
    errors: latest?.error_count || 0,
    filtered: report.filtered_count || report.filtered || 0,
    mapped: (report.mapped_category_count || 0) + (report.mapped_brand_count || 0),
    stockStrategy: (report.zero_stocked_count || report.zero_stocked || 0) + (report.deactivated_count || report.deactivated || 0),
  };
}

export function ImportCenterPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [xmlSources, setXmlSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [catalogCategories, setCatalogCategories] = useState([]);
  const [catalogBrands, setCatalogBrands] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [sourceType, setSourceType] = useState('xml');
  const [step, setStep] = useState(0);
  const [xmlForm, setXmlForm] = useState(xmlInitial);
  const [activeXmlSource, setActiveXmlSource] = useState(null);
  const [excelCompanyId, setExcelCompanyId] = useState('');
  const [excelSupplier, setExcelSupplier] = useState('');
  const [excelFile, setExcelFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [options, setOptions] = useState(defaultOptions);
  const [lastQueuedRunId, setLastQueuedRunId] = useState(null);
  const [mappingTab, setMappingTab] = useState('categories');
  const [runDetailTab, setRunDetailTab] = useState('summary');
  const [selectedXmlSourceId, setSelectedXmlSourceId] = useState(null);

  const headers = useMemo(() => asArray(preview?.headers), [preview]);
  const validRows = asArray(preview?.valid_rows);
  const invalidRows = asArray(preview?.invalid_rows);
  const previewRows = [...validRows, ...invalidRows];
  const previewCategories = useMemo(() => uniqueMappedValues(previewRows, 'category'), [validRows, invalidRows]);
  const previewBrands = useMemo(() => uniqueMappedValues(previewRows, 'brand'), [validRows, invalidRows]);
  const safeMapping = asObject(mapping);
  const safeOptions = mergeOptions(options);
  const categoryMappingRows = buildMappingRows(previewCategories, safeOptions.mappings.categories, catalogCategories);
  const brandMappingRows = buildMappingRows(previewBrands, safeOptions.mappings.brands, catalogBrands);
  const categoryMappingStats = mappingStats(categoryMappingRows);
  const brandMappingStats = mappingStats(brandMappingRows);
  const activeMappingRows = mappingTab === 'categories' ? categoryMappingRows : brandMappingRows;
  const activeMappingResources = mappingTab === 'categories' ? catalogCategories : catalogBrands;
  const activeMappingTypeLabel = mappingTab === 'categories' ? 'kategori' : 'marka';
  const mappedFieldCount = Object.values(safeMapping).filter(Boolean).length;
  const missingRequiredMappings = requiredFields.filter((field) => !safeMapping[field]);
  const hasIdentifierMapping = Boolean(safeMapping.sku || safeMapping.barcode);
  const blockingMappingMissing = !hasIdentifierMapping || (!safeOptions.update_stock_price_only && !safeMapping.name);
  const activeCompanyId = sourceType === 'xml' ? xmlForm.company_id : excelCompanyId;
  const importReady = sourceType === 'xml'
    ? Boolean(activeXmlSource && hasIdentifierMapping)
    : Boolean(excelCompanyId && excelFile && hasIdentifierMapping);

  const load = async () => {
    await run(async () => {
      const [companyResponse, sourceResponse, runResponse, categoryResponse, brandResponse] = await Promise.all([
        api.companies.list(),
        api.xmlSources.list(),
        api.imports.runs(),
        api.catalogResources.list({ type: 'categories', active: 1 }),
        api.catalogResources.list({ type: 'brands', active: 1 }),
      ]);
      setCompanies(asArray(companyResponse));
      setXmlSources(asArray(sourceResponse));
      setRuns(asArray(runResponse));
      setCatalogCategories(asArray(categoryResponse));
      setCatalogBrands(asArray(brandResponse));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const resetPreview = (clearMapping = true) => {
    setPreview(null);
    if (clearMapping) setMapping({});
    setSelectedRun(null);
    setLastQueuedRunId(null);
  };

  const selectSourceType = (type) => {
    setSourceType(type);
    setStep(1);
    resetPreview();
  };

  const selectXmlSource = (id) => {
    const source = xmlSources.find((item) => String(item.id) === String(id));
    setActiveXmlSource(source || null);
    setXmlForm(source ? {
      company_id: source.company_id || '',
      name: source.name || '',
      supplier_name: source.supplier_name || '',
      url: source.url || '',
      username: source.username || '',
      password: source.password || '',
      frequency_minutes: source.frequency_minutes || 1440,
      is_active: source.is_active !== false,
    } : xmlInitial);
    setMapping(asObject(source?.field_mapping));
    setOptions(mergeOptions(source?.options));
    resetPreview(false);
  };

  const saveXmlSource = async (event) => {
    event.preventDefault();
    if (!xmlForm.company_id || !xmlForm.name || !xmlForm.url) {
      setError('XML kaynagi icin firma, kaynak adi ve URL zorunludur.');
      return;
    }

    await run(async () => {
      const payload = { ...xmlForm, frequency_minutes: Number(xmlForm.frequency_minutes), field_mapping: safeMapping, options: safeOptions };
      const saved = activeXmlSource ? await api.xmlSources.update(activeXmlSource.id, payload) : await api.xmlSources.create(payload);
      setActiveXmlSource(saved);
      setXmlForm({ ...xmlForm, company_id: saved.company_id || xmlForm.company_id });
      notify('success', activeXmlSource ? 'XML kaynagi guncellendi.' : 'XML kaynagi kaydedildi.');
      await load();
      setStep(2);
    }, { onError: (message) => notify('error', message) });
  };

  const previewExcel = async () => {
    if (!excelCompanyId || !excelFile) {
      setError('Excel on kontrolu icin firma ve dosya zorunludur.');
      return;
    }

    const body = new FormData();
    body.append('company_id', excelCompanyId);
    body.append('file', excelFile);
    Object.entries(safeMapping).forEach(([key, value]) => body.append(`field_mapping[${key}]`, value || ''));
    await run(async () => {
      const response = await api.imports.previewExcel(body);
      setPreview(response);
      setMapping(asObject(response.suggested_mapping));
      setActiveXmlSource(null);
      notify('success', 'Excel onizleme hazirlandi.');
      setStep(3);
    }, { onError: (message) => notify('error', message) });
  };

  const previewXml = async () => {
    if (!activeXmlSource) {
      setError('XML on kontrolu icin once kaynak secin veya kaydedin.');
      return;
    }

    await run(async () => {
      const response = await api.xmlSources.preview(activeXmlSource.id, { field_mapping: safeMapping });
      setPreview(response);
      setMapping(asObject(response.suggested_mapping));
      setExcelCompanyId(String(activeXmlSource.company_id));
      setExcelSupplier(activeXmlSource.supplier_name || '');
      notify('success', 'XML onizleme hazirlandi.');
      setStep(3);
    }, { onError: (message) => notify('error', message) });
  };

  const queueExcel = async () => {
    if (!excelCompanyId || !excelFile || !hasIdentifierMapping) {
      setError('Excel import icin firma, dosya ve SKU veya barkod eslestirmesi zorunludur.');
      return;
    }

    const body = new FormData();
    body.append('company_id', excelCompanyId);
    body.append('file', excelFile);
    body.append('supplier_name', excelSupplier);
    Object.entries(safeMapping).forEach(([key, value]) => body.append(`field_mapping[${key}]`, value || ''));
    Object.entries(safeOptions).forEach(([key, value]) => appendFormData(body, `options[${key}]`, value));

    await run(async () => {
      const response = await api.imports.queueExcel(body);
      setLastQueuedRunId(response.import_run_id);
      notify('success', response.message);
      await load();
      setStep(7);
    }, { onError: (message) => notify('error', message) });
  };

  const importXml = async (source = activeXmlSource) => {
    const effectiveMapping = Object.keys(safeMapping).length > 0 ? safeMapping : asObject(source?.field_mapping);
    const hasXmlIdentifier = Boolean(effectiveMapping.sku || effectiveMapping.barcode);
    if (!source || !hasXmlIdentifier) {
      setError('XML import icin kaynak ve SKU veya barkod eslestirmesi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.xmlSources.import(source.id, { field_mapping: effectiveMapping, options: safeOptions, supplier_name: source.supplier_name });
      setLastQueuedRunId(response.import_run_id);
      notify('success', response.message);
      await load();
      setStep(7);
    }, { onError: (message) => notify('error', message) });
  };

  const saveXmlMapping = async () => {
    if (!activeXmlSource) return;
    await run(async () => {
      await api.xmlSources.update(activeXmlSource.id, { field_mapping: safeMapping, options: safeOptions });
      notify('success', 'XML alan eslestirmesi kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const retryImport = async (runId) => {
    await run(async () => {
      const response = await api.imports.retry(runId);
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const showRun = async (runId) => {
    await run(async () => {
      setSelectedRun(asObject(await api.imports.showRun(runId), null));
      setRunDetailTab('summary');
    }, { onError: (message) => notify('error', message) });
  };

  const editXmlSource = (source) => {
    setSelectedXmlSourceId(source.id);
    setSourceType('xml');
    selectXmlSource(source.id);
    setStep(1);
  };

  const previewXmlSource = (source) => {
    setSelectedXmlSourceId(source.id);
    setSourceType('xml');
    selectXmlSource(source.id);
    setStep(2);
  };

  const toggleXmlSourceActive = async (source) => {
    await run(async () => {
      const updated = await api.xmlSources.update(source.id, { is_active: !source.is_active });
      setXmlSources((current) => current.map((item) => (Number(item.id) === Number(source.id) ? { ...item, ...updated } : item)));
      notify('success', updated.is_active ? 'XML kaynagi aktif edildi.' : 'XML kaynagi pasife alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const setOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const setNestedOption = (group, key, value) => setOptions((current) => ({
    ...current,
    [group]: {
      ...asObject(current[group]),
      [key]: value,
    },
    ...(group === 'image_strategy' && key === 'download_images' ? { download_images: value } : {}),
  }));
  const setSourceMapping = (type, source, value) => setOptions((current) => {
    const mappings = asObject(current.mappings);
    const nextTypeMappings = { ...asObject(mappings[type]) };

    if (value) nextTypeMappings[source] = value;
    else delete nextTypeMappings[source];

    return {
      ...current,
      mappings: {
        ...mappings,
        [type]: nextTypeMappings,
      },
    };
  });
  const applySuggestedMappings = (type, rows, allowedConfidence) => setOptions((current) => {
    const mappings = asObject(current.mappings);
    const nextTypeMappings = { ...asObject(mappings[type]) };

    rows.forEach((row) => {
      if (row.suggestion && allowedConfidence.includes(row.suggestion.confidence)) {
        nextTypeMappings[row.source] = row.suggestion.value;
      }
    });

    return {
      ...current,
      mappings: {
        ...mappings,
        [type]: nextTypeMappings,
      },
    };
  });
  const clearSourceMappings = (type) => setOptions((current) => ({
    ...current,
    mappings: {
      ...asObject(current.mappings),
      [type]: {},
    },
  }));
  const setMappingBehavior = (key, value) => setOptions((current) => ({
    ...current,
    mapping_behavior: {
      ...asObject(current.mapping_behavior),
      [key]: value,
    },
  }));
  const setMissingAction = (value) => setOptions((current) => ({
    ...current,
    deactivate_missing: value === 'passive_missing',
    stock_strategy: {
      ...asObject(current.stock_strategy),
      missing_product_action: value,
    },
  }));
  const runById = (id) => runs.find((item) => Number(item.id) === Number(id));
  const latestRun = lastQueuedRunId ? runById(lastQueuedRunId) : runs[0];
  const latestReport = asObject(latestRun?.report);
  const selectedReport = asObject(selectedRun?.report);
  const selectedErrors = withRowIds(selectedRun?.errors, 'error');
  const selectedFilteredRows = withRowIds(selectedReport.filtered_rows, 'filtered');
  const selectedMappedRows = withRowIds(selectedReport.mapped_rows, 'mapped');
  const selectedPriceRows = withRowIds(selectedReport.price_changed_rows, 'price');
  const selectedStockRows = withRowIds(selectedReport.stock_strategy_rows, 'stock');
  const selectedErrorBreakdown = Object.entries(asObject(selectedReport.error_breakdown)).map(([message, count]) => ({ id: message, message, count }));
  const selectedXmlSource = xmlSources.find((source) => Number(source.id) === Number(selectedXmlSourceId)) || xmlSources[0] || null;
  const selectedSourceRuns = selectedXmlSource ? getSourceRuns(selectedXmlSource, runs).slice(0, 10) : [];
  const selectedSourceStatus = selectedXmlSource ? getAutomationStatus(selectedXmlSource, runs) : null;
  const selectedSourceSummary = selectedXmlSource ? getSourceRunSummary(selectedXmlSource, runs) : null;
  const sourceAutomationStats = xmlSources.reduce((stats, source) => {
    const status = getAutomationStatus(source, runs).key;
    return {
      total: stats.total + 1,
      active: stats.active + (source.is_active ? 1 : 0),
      due: stats.due + (status === 'due' ? 1 : 0),
      busy: stats.busy + (['queued', 'running'].includes(status) ? 1 : 0),
      errors: stats.errors + (status === 'error' ? 1 : 0),
    };
  }, { total: 0, active: 0, due: 0, busy: 0, errors: 0 });

  return (
    <>
      <PageHeader title="XML / Excel Import Merkezi" />

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <LoadingState label="Import islemi hazirlaniyor..." />}

      <section className="panel import-wizard-panel">
        <div className="wizard-steps import-steps">
          {wizardSteps.map((label, index) => (
            <button type="button" className={index === step ? 'wizard-step active' : 'wizard-step'} key={label} onClick={() => setStep(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <div className="import-wizard-body">
          {step === 0 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 1 / {wizardSteps.length}</span>
                <h2>Kaynak tipi sec</h2>
                <p>Tedarikci XML URL'si veya Excel dosyasi ile toplu urun aktarimina baslayin.</p>
              </div>
              <div className="import-source-cards">
                <button type="button" className={sourceType === 'xml' ? 'import-source-card active' : 'import-source-card'} onClick={() => selectSourceType('xml')}>
                  <Link2 size={24} />
                  <strong>XML URL</strong>
                  <span>Tedarikci URL'sini kaydet, onizle ve manuel import baslat.</span>
                </button>
                <button type="button" className={sourceType === 'excel' ? 'import-source-card active' : 'import-source-card'} onClick={() => selectSourceType('excel')}>
                  <FileSpreadsheet size={24} />
                  <strong>Excel dosyasi</strong>
                  <span>XLSX, XLS veya CSV dosyasini onizle, eslestir ve kuyruga al.</span>
                </button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 2 / {wizardSteps.length}</span>
                <h2>{sourceTypeLabel(sourceType)} bilgisi</h2>
                <p>Kaynak bilgilerini tamamlayin. XML icin kaynagi kaydettikten sonra on kontrol calisir.</p>
              </div>
              {sourceType === 'xml' ? (
                <form className="form-grid" onSubmit={saveXmlSource}>
                  <Field label="Kayitli XML kaynaklari">
                    <select value={activeXmlSource?.id || ''} onChange={(event) => selectXmlSource(event.target.value)}>
                      <option value="">Yeni kaynak</option>
                      {xmlSources.map((source) => <option key={source.id} value={source.id}>{source.name} - {source.supplier_name || 'Tedarikci yok'}</option>)}
                    </select>
                  </Field>
                  <Field label="Firma">
                    <select value={xmlForm.company_id} onChange={(event) => setXmlForm({ ...xmlForm, company_id: event.target.value })}>
                      <option value="">Seciniz</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Kaynak adi"><input value={xmlForm.name} onChange={(event) => setXmlForm({ ...xmlForm, name: event.target.value })} /></Field>
                  <Field label="Tedarikci"><input value={xmlForm.supplier_name} onChange={(event) => setXmlForm({ ...xmlForm, supplier_name: event.target.value })} /></Field>
                  <Field label="XML URL"><input value={xmlForm.url} onChange={(event) => setXmlForm({ ...xmlForm, url: event.target.value })} /></Field>
                  <Field label="Kullanici adi"><input value={xmlForm.username} onChange={(event) => setXmlForm({ ...xmlForm, username: event.target.value })} /></Field>
                  <Field label="Sifre"><input type="password" value={xmlForm.password} onChange={(event) => setXmlForm({ ...xmlForm, password: event.target.value })} /></Field>
                  <Field label="Calisma sikligi">
                    <select value={xmlForm.frequency_minutes} onChange={(event) => setXmlForm({ ...xmlForm, frequency_minutes: event.target.value })}>
                      <option value="60">Saatlik</option>
                      <option value="360">6 Saatte Bir</option>
                      <option value="720">12 Saatte Bir</option>
                      <option value="1440">Gunluk</option>
                    </select>
                  </Field>
                  <label className="check-row"><input type="checkbox" checked={xmlForm.is_active} onChange={(event) => setXmlForm({ ...xmlForm, is_active: event.target.checked })} /> Aktif kaynak</label>
                  <button disabled={loading}><Save size={16} /> Kaynagi Kaydet</button>
                </form>
              ) : (
                <div className="form-grid">
                  <Field label="Firma">
                    <select value={excelCompanyId} onChange={(event) => setExcelCompanyId(event.target.value)}>
                      <option value="">Seciniz</option>
                      {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Tedarikci"><input value={excelSupplier} onChange={(event) => setExcelSupplier(event.target.value)} /></Field>
                  <Field label="Excel dosyasi">
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { setExcelFile(event.target.files[0]); resetPreview(); }} />
                  </Field>
                  <SoftEmpty><strong>{excelFile?.name || 'Dosya secilmedi'}</strong><span>XLSX, XLS veya CSV formatlari desteklenir.</span></SoftEmpty>
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 3 / {wizardSteps.length}</span>
                <h2>Dosya / URL on kontrol</h2>
                <p>Kaynak okunabilir mi, kolonlar veya XML alanlari algilaniyor mu burada kontrol edilir.</p>
              </div>
              <div className="import-check-grid">
                <SoftEmpty><strong>{sourceTypeLabel(sourceType)}</strong><span>{sourceType === 'xml' ? (activeXmlSource?.url || xmlForm.url || '-') : (excelFile?.name || '-')}</span></SoftEmpty>
                <SoftEmpty><strong>{companies.find((company) => String(company.id) === String(activeCompanyId))?.name || 'Firma secilmedi'}</strong><span>Import firmasi</span></SoftEmpty>
                <SoftEmpty><strong>{sourceType === 'xml' ? (activeXmlSource?.supplier_name || xmlForm.supplier_name || '-') : (excelSupplier || '-')}</strong><span>Tedarikci</span></SoftEmpty>
              </div>
              <button type="button" disabled={loading} onClick={sourceType === 'xml' ? previewXml : previewExcel}><Eye size={16} /> On Kontrol ve Onizleme Baslat</button>
            </>
          )}

          {step === 3 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 4 / {wizardSteps.length}</span>
                <h2>Alan eslestirme</h2>
                <p>Zorunlu alanlari kaynak kolonlariyla eslestirin. SKU veya barkod olmadan import baslatilmaz.</p>
              </div>
              {!preview ? <SoftEmpty>Alan eslestirme icin once on kontrol calistirin.</SoftEmpty> : (
                <>
                  <div className="import-mapping-summary">
                    <div><span>Algilanan kolon</span><strong>{headers.length}</strong></div>
                    <div><span>Eslestirilen alan</span><strong>{mappedFieldCount}</strong></div>
                    <div><span>Eksik zorunlu</span><strong>{missingRequiredMappings.length}</strong></div>
                  </div>
                  <div className="mapping-grid import-mapping-grid">
                    {Object.entries(importFields).map(([field, label]) => (
                      <Field key={field} label={`${label}${requiredFields.includes(field) ? ' *' : ''}`}>
                        <select value={mapping[field] || ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
                          <option value="">Eslestirme yok</option>
                          {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                        </select>
                      </Field>
                    ))}
                  </div>
                  {missingRequiredMappings.length > 0 && (
                    <div className="state-box workflow-warning">
                      <AlertTriangle size={18} />
                      <span>Eksik eslesmeler: {missingRequiredMappings.map((field) => importFields[field]).join(', ')}.</span>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step === 4 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 5 / {wizardSteps.length}</span>
                <h2>Veri onizleme</h2>
                <p>Import baslamadan once basarili ve hatali satirlari kontrol edin.</p>
              </div>
              {!preview ? <SoftEmpty>Onizleme bulunamadi.</SoftEmpty> : (
                <div className="import-preview">
                  <div>
                    <h3>Basarili onizleme</h3>
                    {validRows.length === 0 ? <p className="bad-text">Gecerli satir bulunamadi.</p> : validRows.slice(0, 6).map((row) => <pre key={row.row}>{JSON.stringify(row.mapped, null, 2)}</pre>)}
                  </div>
                  <div>
                    <h3>Hatali satirlar</h3>
                    {invalidRows.length === 0 ? <p className="ok-text">Hata yok</p> : invalidRows.slice(0, 10).map((row) => <p key={row.row} className="bad-text">Satir {row.row}: {row.message}</p>)}
                  </div>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 6 / {wizardSteps.length}</span>
                <h2>Validasyon ve import ayarlari</h2>
                <p>Guncelleme, stok/fiyat modu ve gorsel islemlerini import baslamadan once belirleyin.</p>
              </div>
              <div className="option-grid">
                <Field label="Eslesme anahtari">
                  <select value={safeOptions.match_by} onChange={(event) => setOption('match_by', event.target.value)}>
                    <option value="sku">SKU</option>
                    <option value="barcode">Barkod</option>
                  </select>
                </Field>
                <label><input type="checkbox" checked={safeOptions.update_existing} onChange={(event) => setOption('update_existing', event.target.checked)} /> Ayni SKU/Barkod varsa guncelle</label>
                <label><input type="checkbox" checked={safeOptions.update_stock_price_only} onChange={(event) => setOption('update_stock_price_only', event.target.checked)} /> Sadece stok/fiyat guncelle</label>
              </div>
              <div className="wizard-step-header compact-header">
                <span>XML kaynak yonetimi</span>
                <h3>Gelismis XML Ayarlari</h3>
                <p>Filtreleme, fiyat, stok stratejisi, baslik/aciklama donusumu ve gorsel limitlerini kaynaga bagli olarak saklayin.</p>
              </div>
              <div className="option-grid">
                <Field label="Minimum stok">
                  <input type="number" min="0" value={safeOptions.filters.minimum_stock} onChange={(event) => setNestedOption('filters', 'minimum_stock', event.target.value)} placeholder="Orn. 1" />
                </Field>
                <Field label="Minimum fiyat">
                  <input type="number" min="0" step="0.01" value={safeOptions.filters.minimum_price} onChange={(event) => setNestedOption('filters', 'minimum_price', event.target.value)} placeholder="Orn. 100" />
                </Field>
                <Field label="Dahil kategoriler">
                  <textarea rows={3} value={optionListText(safeOptions.filters.include_categories)} onChange={(event) => setNestedOption('filters', 'include_categories', event.target.value)} placeholder="Her satira bir kategori" />
                </Field>
                <Field label="Haric kategoriler">
                  <textarea rows={3} value={optionListText(safeOptions.filters.exclude_categories)} onChange={(event) => setNestedOption('filters', 'exclude_categories', event.target.value)} placeholder="Her satira bir kategori" />
                </Field>
                <Field label="Haric markalar">
                  <textarea rows={3} value={optionListText(safeOptions.filters.exclude_brands)} onChange={(event) => setNestedOption('filters', 'exclude_brands', event.target.value)} placeholder="Her satira bir marka" />
                </Field>
                <Field label="Kaynak kar orani (%)">
                  <input type="number" step="0.01" value={safeOptions.pricing.source_profit_rate} onChange={(event) => setNestedOption('pricing', 'source_profit_rate', event.target.value)} placeholder="Orn. 15" />
                </Field>
                <Field label="Fiyat carpani">
                  <input type="number" min="0" step="0.01" value={safeOptions.pricing.price_multiplier} onChange={(event) => setNestedOption('pricing', 'price_multiplier', event.target.value)} placeholder="Orn. 1.20" />
                </Field>
                <Field label="Yuvarlama">
                  <select value={safeOptions.pricing.rounding_mode} onChange={(event) => setNestedOption('pricing', 'rounding_mode', event.target.value)}>
                    <option value="none">Yok</option>
                    <option value="nearest_integer">En yakin tam sayi</option>
                    <option value="nearest_90">Sonu .90</option>
                    <option value="nearest_99">Sonu .99</option>
                  </select>
                </Field>
                <Field label="Eksik urun stratejisi">
                  <select value={safeOptions.stock_strategy.missing_product_action} onChange={(event) => setMissingAction(event.target.value)}>
                    <option value="none">Islem yapma</option>
                    <option value="passive_missing">Eksikleri pasife al</option>
                    <option value="zero_stock_missing">Eksiklerin stokunu sifirla</option>
                  </select>
                </Field>
                <Field label="Urun adi prefix">
                  <input value={safeOptions.transforms.title_prefix} onChange={(event) => setNestedOption('transforms', 'title_prefix', event.target.value)} placeholder="Orn. Yeni" />
                </Field>
                <Field label="Urun adi suffix">
                  <input value={safeOptions.transforms.title_suffix} onChange={(event) => setNestedOption('transforms', 'title_suffix', event.target.value)} placeholder="Orn. Outlet" />
                </Field>
                <label><input type="checkbox" checked={safeOptions.transforms.strip_html_description} onChange={(event) => setNestedOption('transforms', 'strip_html_description', event.target.checked)} /> Aciklamadan HTML temizle</label>
                <label><input type="checkbox" checked={safeOptions.image_strategy.download_images} onChange={(event) => setNestedOption('image_strategy', 'download_images', event.target.checked)} /> Gorsel URL indir</label>
                <Field label="Maksimum gorsel">
                  <select value={safeOptions.image_strategy.max_image_count} onChange={(event) => setNestedOption('image_strategy', 'max_image_count', Number(event.target.value))}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option key={count} value={count}>{count}</option>)}
                  </select>
                </Field>
              </div>
              <div className="wizard-step-header compact-header">
                <span>Canonical katalog</span>
                <h3>Eslesmeyen Kategori / Marka Yonetimi</h3>
                <p>Preview'dan gelen ham XML degerlerini ic katalogla eslestirin; oneriler kaydedilmeden once sizin onayinizi bekler.</p>
              </div>
              <div className="option-grid">
                <label><input type="checkbox" checked={safeOptions.mapping_behavior.apply_category_mapping} onChange={(event) => setMappingBehavior('apply_category_mapping', event.target.checked)} /> Kategori mapping uygula</label>
                <label><input type="checkbox" checked={safeOptions.mapping_behavior.apply_brand_mapping} onChange={(event) => setMappingBehavior('apply_brand_mapping', event.target.checked)} /> Marka mapping uygula</label>
              </div>
              <div className="xml-mapping-dashboard">
                <div className="xml-mapping-kpis">
                  <div><span>Toplam kategori</span><strong>{categoryMappingStats.total}</strong></div>
                  <div><span>Eslesen kategori</span><strong>{categoryMappingStats.mapped}</strong></div>
                  <div><span>Eslesmeyen kategori</span><strong>{categoryMappingStats.unmapped}</strong></div>
                  <div><span>Onerili kategori</span><strong>{categoryMappingStats.suggested}</strong></div>
                  <div><span>Toplam marka</span><strong>{brandMappingStats.total}</strong></div>
                  <div><span>Eslesen marka</span><strong>{brandMappingStats.mapped}</strong></div>
                  <div><span>Eslesmeyen marka</span><strong>{brandMappingStats.unmapped}</strong></div>
                  <div><span>Onerili marka</span><strong>{brandMappingStats.suggested}</strong></div>
                </div>
                <div className="tabs xml-mapping-tabs">
                  <button type="button" className={mappingTab === 'categories' ? 'tab active' : 'tab'} onClick={() => setMappingTab('categories')}>Kategoriler</button>
                  <button type="button" className={mappingTab === 'brands' ? 'tab active' : 'tab'} onClick={() => setMappingTab('brands')}>Markalar</button>
                </div>
                <div className="xml-mapping-toolbar">
                  <span>{activeMappingRows.length} XML {activeMappingTypeLabel} degeri</span>
                  <div>
                    <button type="button" className="secondary-button" onClick={() => applySuggestedMappings(mappingTab, activeMappingRows, ['exact'])}>Tum exact onerileri uygula</button>
                    <button type="button" className="secondary-button" onClick={() => applySuggestedMappings(mappingTab, activeMappingRows, ['normalized'])}>Tum normalized onerileri uygula</button>
                    <button type="button" className="secondary-button" onClick={() => clearSourceMappings(mappingTab)}>Mappingleri temizle</button>
                  </div>
                </div>
                {activeMappingRows.length === 0 ? (
                  <SoftEmpty title="Preview verisi yok" text={`Preview calistiginda XML ${activeMappingTypeLabel} degerleri burada gorunur.`} />
                ) : (
                  <div className="xml-mapping-table">
                    <div className="xml-mapping-row heading">
                      <span>XML degeri</span>
                      <span>Durum</span>
                      <span>Oneri</span>
                      <span>Ic {activeMappingTypeLabel}</span>
                      <span>Aksiyon</span>
                    </div>
                    {activeMappingRows.map((row) => (
                      <div className="xml-mapping-row" key={row.source}>
                        <strong>{row.source}</strong>
                        <StatusPill tone={mappingStatusTone(row.status)} label={mappingStatusLabel(row.status)} />
                        <div className="xml-suggestion-cell">
                          {row.suggestion ? (
                            <>
                              <span>{row.suggestion.value}</span>
                              <small className={`xml-suggestion-confidence ${row.suggestion.confidence}`}>{row.suggestion.confidence}</small>
                              <small>{row.suggestion.reason}</small>
                            </>
                          ) : <span className="muted-text">Oneri yok</span>}
                        </div>
                        <select value={row.mappedValue} onChange={(event) => setSourceMapping(mappingTab, row.source, event.target.value)}>
                          <option value="">Ham degeri koru</option>
                          {activeMappingResources.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}
                        </select>
                        <div className="row-actions">
                          {row.suggestion ? (
                            <button type="button" className={row.suggestion.confidence === 'contains' ? 'secondary-button caution-button' : 'secondary-button'} onClick={() => setSourceMapping(mappingTab, row.source, row.suggestion.value)}>Oneriyi uygula</button>
                          ) : null}
                          {row.mappedValue ? <button type="button" className="secondary-button" onClick={() => setSourceMapping(mappingTab, row.source, '')}>Temizle</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={blockingMappingMissing ? 'state-box workflow-warning' : 'state-box success-empty'}>
                <CheckCircle2 size={18} />
                <span>{blockingMappingMissing ? 'SKU veya barkod eslesmesi ve urun adi kontrol edilmeli.' : 'Import baslatmak icin gerekli ana eslesmeler tamam.'}</span>
              </div>
            </>
          )}

          {step === 6 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 7 / {wizardSteps.length}</span>
                <h2>Import baslat</h2>
                <p>Islem kuyruga alinacak. Durumu import gecmisi ve ilerleme cubugundan takip edebilirsiniz.</p>
              </div>
              <div className="import-launch-card">
                <Database size={24} />
                <strong>{sourceTypeLabel(sourceType)} import hazirligi</strong>
                <span>{validRows.length} onizleme satiri gecerli, {invalidRows.length} satir hatali gorunuyor.</span>
                {sourceType === 'xml' && <button type="button" className="secondary-button" disabled={loading || !activeXmlSource} onClick={saveXmlMapping}>XML eslestirmesini kaydet</button>}
                <button type="button" disabled={loading || !importReady} onClick={sourceType === 'xml' ? importXml : queueExcel}><Play size={16} /> Importu Kuyruga Al</button>
              </div>
            </>
          )}

          {step === 7 && (
            <>
              <div className="wizard-step-header">
                <span>Adim 8 / {wizardSteps.length}</span>
                <h2>Islem sonucu ve gecmis</h2>
                <p>Kuyruga alinan importun ilerlemesini, basarili ve hatali urun sayilarini buradan izleyin.</p>
              </div>
              <div className="queue-summary">
                <div><span>Son import</span><strong>{latestRun?.id || '-'}</strong></div>
                <div><span>Durum</span><strong>{statusLabel(latestRun?.status)}</strong></div>
                <div><span>Basarili</span><strong>{latestRun?.success_count || 0}</strong></div>
                <div><span>Hatali</span><strong>{latestRun?.error_count || 0}</strong></div>
                <div><span>Filtrelenen</span><strong>{latestReport.filtered_count || latestReport.filtered || 0}</strong></div>
                <div><span>Kategori map</span><strong>{latestReport.mapped_category_count || 0}</strong></div>
                <div><span>Marka map</span><strong>{latestReport.mapped_brand_count || 0}</strong></div>
                <div><span>Stok sifirlanan</span><strong>{latestReport.zero_stocked_count || latestReport.zero_stocked || 0}</strong></div>
                <div><span>Pasife alinan</span><strong>{latestReport.deactivated_count || latestReport.deactivated || 0}</strong></div>
                <div><span>Ilerleme</span><strong>{latestRun?.progress || 0}%</strong></div>
              </div>
            </>
          )}
        </div>

        <div className="wizard-actions">
          <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Geri</button>
          {step < 7 && <button type="button" disabled={(step === 1 && sourceType === 'xml' && !activeXmlSource && !xmlForm.url) || (step === 1 && sourceType === 'excel' && (!excelCompanyId || !excelFile))} onClick={() => setStep((current) => current + 1)}>Ileri</button>}
        </div>
      </section>

      <section className="import-history-grid">
        <section className="panel xml-source-automation-panel">
          <div className="wizard-step-header compact-header">
            <span>XML otomasyon</span>
            <h2>XML Kaynak Yonetimi</h2>
            <p>Scheduler 5 dakikada bir calisir; siradaki calisma zamani kaynak frekansi ve son import zamanindan yaklasik hesaplanir.</p>
          </div>
          <div className="xml-source-kpis">
            <div><span>Toplam kaynak</span><strong>{sourceAutomationStats.total}</strong></div>
            <div><span>Aktif kaynak</span><strong>{sourceAutomationStats.active}</strong></div>
            <div><span>Calismaya hazir</span><strong>{sourceAutomationStats.due}</strong></div>
            <div><span>Kuyruk / calisan</span><strong>{sourceAutomationStats.busy}</strong></div>
            <div><span>Son calisma hatali</span><strong>{sourceAutomationStats.errors}</strong></div>
          </div>

          {xmlSources.length === 0 ? (
            <SoftEmpty title="XML kaynagi yok" text="Tedarikci XML URL'si ekleyerek periyodik urun aktarimina baslayin." />
          ) : (
            <div className="xml-source-dashboard">
              <div className="xml-source-list">
                {xmlSources.map((source) => {
                  const status = getAutomationStatus(source, runs);
                  const runningRun = getRunningSourceRun(source, runs);
                  const summary = getSourceRunSummary(source, runs);
                  const isSelected = Number(selectedXmlSource?.id) === Number(source.id);

                  return (
                    <button type="button" key={source.id} className={isSelected ? 'xml-source-card active' : 'xml-source-card'} onClick={() => setSelectedXmlSourceId(source.id)}>
                      <div className="xml-source-card-head">
                        <div>
                          <strong>{source.name}</strong>
                          <span>{source.supplier_name || 'Tedarikci yok'} · {source.company?.name || 'Firma yok'}</span>
                        </div>
                        <StatusPill tone={status.tone} label={status.label} />
                      </div>
                      <div className="xml-source-card-grid">
                        <div><span>Siklik</span><strong>{formatFrequency(source.frequency_minutes)}</strong></div>
                        <div><span>Siradaki</span><strong>{source.is_active ? formatDateTime(getNextRunAt(source)) : 'Pasif'}</strong></div>
                        <div><span>Son calisma</span><strong>{formatDateTime(source.last_import_at)}</strong></div>
                        <div><span>Son durum</span><strong>{statusLabel(source.last_status)}</strong></div>
                      </div>
                      {runningRun ? (
                        <div className="xml-source-progress">
                          <span>{statusLabel(runningRun.status)} · %{runningRun.progress || 0}</span>
                          <div className="progress inline-progress"><span style={{ width: `${runningRun.progress || 0}%` }} /></div>
                        </div>
                      ) : null}
                      <div className="xml-source-run-summary">
                        <span>Basarili <strong>{summary.success}</strong></span>
                        <span>Hatali <strong>{summary.errors}</strong></span>
                        <span>Filtre <strong>{summary.filtered}</strong></span>
                        <span>Mapping <strong>{summary.mapped}</strong></span>
                        <span>Stok <strong>{summary.stockStrategy}</strong></span>
                      </div>
                      {source.last_error ? <p className="xml-source-error">{source.last_error}</p> : null}
                    </button>
                  );
                })}
              </div>

              <aside className="xml-source-detail-panel">
                {selectedXmlSource ? (
                  <>
                    <div className="xml-source-detail-head">
                      <div>
                        <span className="eyebrow">Kaynak detayi</span>
                        <h3>{selectedXmlSource.name}</h3>
                        <p>{selectedXmlSource.supplier_name || 'Tedarikci yok'}</p>
                      </div>
                      <StatusPill tone={selectedSourceStatus?.tone} label={selectedSourceStatus?.label} />
                    </div>
                    <div className="xml-source-detail-grid">
                      <div><span>Firma</span><strong>{selectedXmlSource.company?.name || '-'}</strong></div>
                      <div><span>Otomasyon</span><strong>{selectedXmlSource.is_active ? 'Aktif' : 'Pasif'}</strong></div>
                      <div><span>Calisma sikligi</span><strong>{formatFrequency(selectedXmlSource.frequency_minutes)}</strong></div>
                      <div><span>Siradaki calisma</span><strong>{selectedXmlSource.is_active ? formatDateTime(getNextRunAt(selectedXmlSource)) : 'Scheduler pasif'}</strong></div>
                      <div><span>Son calisma</span><strong>{formatDateTime(selectedXmlSource.last_import_at)}</strong></div>
                      <div><span>Son run</span><strong>{selectedSourceSummary?.latest?.id || '-'}</strong></div>
                    </div>
                    {!selectedXmlSource.is_active ? (
                      <div className="state-box workflow-warning">
                        <PauseCircle size={18} />
                        <span>Pasif kaynaklari scheduler calistirmaz. Manuel calisma otomasyondan bagimsizdir.</span>
                      </div>
                    ) : null}
                    {selectedXmlSource.last_error ? (
                      <div className="state-box workflow-warning">
                        <AlertTriangle size={18} />
                        <span>{selectedXmlSource.last_error}</span>
                      </div>
                    ) : null}
                    <div className="xml-source-actions">
                      <button type="button" className="secondary-button" onClick={() => previewXmlSource(selectedXmlSource)}><Eye size={15} /> Onizle</button>
                      <button type="button" onClick={() => importXml(selectedXmlSource)}><Play size={15} /> Manuel Calistir</button>
                      <button type="button" className="secondary-button" onClick={() => editXmlSource(selectedXmlSource)}><Save size={15} /> Duzenle</button>
                      <button type="button" className="secondary-button" onClick={() => toggleXmlSourceActive(selectedXmlSource)}>{selectedXmlSource.is_active ? <PauseCircle size={15} /> : <Power size={15} />} {selectedXmlSource.is_active ? 'Pasife Al' : 'Aktif Et'}</button>
                    </div>
                    <div className="xml-source-run-list">
                      <h3>Kaynak bazli son runlar</h3>
                      {selectedSourceRuns.length === 0 ? (
                        <SoftEmpty title="Run gecmisi yok" text="Bu kaynak icin son 30 import kaydi icinde run bulunmuyor." />
                      ) : selectedSourceRuns.map((sourceRun) => (
                        <div className="xml-source-run-item" key={sourceRun.id}>
                          <div>
                            <strong>Run #{sourceRun.id}</strong>
                            <span>{formatDateTime(sourceRun.queued_at || sourceRun.created_at)} · {sourceRun.progress || 0}%</span>
                          </div>
                          <StatusPill tone={statusClass(sourceRun.status)} label={statusLabel(sourceRun.status)} />
                          <button type="button" className="secondary-button" onClick={() => showRun(sourceRun.id)}>Run detayini ac</button>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <SoftEmpty title="Kaynak secin" text="Otomasyon durumu ve run gecmisi icin bir XML kaynagi secin." />
                )}
              </aside>
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Import Gecmisi</h2>
          <DataTable
            rows={runs}
            emptyTitle="Import gecmisi yok"
            emptyText="Ilk XML veya Excel importunu baslattiginizda durum burada gorunur."
            columns={[
              { key: 'id', label: 'ID' },
              { key: 'source_type', label: 'Kaynak', render: (row) => sourceTypeLabel(row.source_type) },
              { key: 'supplier_name', label: 'Tedarikci' },
              { key: 'status', label: 'Durum', render: (row) => <StatusPill tone={statusClass(row.status)} label={statusLabel(row.status)} /> },
              { key: 'progress', label: 'Ilerleme', render: (row) => <div className="progress inline-progress"><span style={{ width: `${row.progress || 0}%` }} /></div> },
              { key: 'success_count', label: 'Basarili' },
              { key: 'error_count', label: 'Hatali' },
              { key: 'time', label: 'Baslangic / Bitis', render: runDuration },
              { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" onClick={() => showRun(row.id)}><Eye size={15} /> Hata Detayi</button><button type="button" onClick={() => retryImport(row.id)} disabled={!['failed', 'completed', 'completed_with_errors'].includes(row.status)}><RotateCcw size={15} /> Tekrar Dene</button></div> },
            ]}
          />
        </section>
      </section>

      {selectedRun && (
        <section className="panel import-run-detail-panel">
          <div className="wizard-step-header compact-header">
            <span>Import run #{selectedRun.id}</span>
            <h2>Import Run Detayi</h2>
            <p>Satir bazli hata, filtre, mapping, fiyat ve stok stratejisi raporlarini inceleyin.</p>
          </div>
          <div className="queue-summary">
            <div><span>Toplam</span><strong>{selectedRun.total_rows}</strong></div>
            <div><span>Basarili</span><strong>{selectedRun.success_count}</strong></div>
            <div><span>Hatali</span><strong>{selectedRun.error_count}</strong></div>
            <div><span>Yeni</span><strong>{selectedRun.created_count}</strong></div>
            <div><span>Guncel</span><strong>{selectedRun.updated_count}</strong></div>
            <div><span>Filtrelenen</span><strong>{selectedReport.filtered_count || selectedReport.filtered || 0}</strong></div>
            <div><span>Kategori map</span><strong>{selectedReport.mapped_category_count || 0}</strong></div>
            <div><span>Marka map</span><strong>{selectedReport.mapped_brand_count || 0}</strong></div>
            <div><span>Kategori eslesmeyen</span><strong>{selectedReport.unmapped_category_count || 0}</strong></div>
            <div><span>Marka eslesmeyen</span><strong>{selectedReport.unmapped_brand_count || 0}</strong></div>
            <div><span>Stok sifirlanan</span><strong>{selectedReport.zero_stocked_count || selectedReport.zero_stocked || 0}</strong></div>
            <div><span>Pasife alinan</span><strong>{selectedReport.deactivated_count || selectedReport.deactivated || 0}</strong></div>
          </div>
          <div className="tabs import-run-tabs">
            {[
              ['summary', 'Ozet'],
              ['errors', 'Hatalar'],
              ['filtered', 'Filtrelenen'],
              ['mapping', 'Mapping'],
              ['price', 'Fiyat'],
              ['stock', 'Stok Stratejisi'],
            ].map(([key, label]) => (
              <button type="button" key={key} className={runDetailTab === key ? 'tab active' : 'tab'} onClick={() => setRunDetailTab(key)}>{label}</button>
            ))}
          </div>

          {runDetailTab === 'summary' && (
            <div className="import-run-summary-grid">
              <SoftEmpty><strong>{selectedFilteredRows.length}</strong><span>Detayli filtre kaydi</span></SoftEmpty>
              <SoftEmpty><strong>{selectedMappedRows.length}</strong><span>Mapping uygulanan satir</span></SoftEmpty>
              <SoftEmpty><strong>{selectedPriceRows.length}</strong><span>Fiyat kurali uygulanan satir</span></SoftEmpty>
              <SoftEmpty><strong>{selectedStockRows.length}</strong><span>Stok stratejisi kaydi</span></SoftEmpty>
              <div className="import-error-breakdown">
                <h3>Hata kirilimi</h3>
                {selectedErrorBreakdown.length === 0 ? (
                  <p className="muted-text">Validasyon hatasi yok.</p>
                ) : selectedErrorBreakdown.map((item) => (
                  <div key={item.id}><span>{item.message}</span><strong>{item.count}</strong></div>
                ))}
              </div>
            </div>
          )}

          {runDetailTab === 'errors' && (
            <DataTable
              rows={selectedErrors}
              emptyTitle="Hata yok"
              emptyText="Bu import kaydinda satir bazli hata bulunmuyor."
              columns={[
                { key: 'row_number', label: 'Satir' },
                { key: 'sku', label: 'SKU' },
                { key: 'barcode', label: 'Barkod' },
                { key: 'message', label: 'Hata' },
                { key: 'payload', label: 'Payload', render: (row) => <details className="json-collapse"><summary>Detay</summary><pre>{JSON.stringify(row.payload || {}, null, 2)}</pre></details> },
              ]}
            />
          )}

          {runDetailTab === 'filtered' && (
            <DataTable
              rows={selectedFilteredRows}
              emptyTitle="Filtrelenen satir yok"
              emptyText="Bu import run icinde filtre sebebiyle atlanan satir bulunmuyor."
              columns={[
                { key: 'row_number', label: 'Satir' },
                { key: 'sku', label: 'SKU' },
                { key: 'barcode', label: 'Barkod' },
                { key: 'category', label: 'Kategori' },
                { key: 'brand', label: 'Marka' },
                { key: 'reason', label: 'Sebep', render: (row) => <StatusPill tone="blocked" label={filterReasonLabel(row.reason)} /> },
              ]}
            />
          )}

          {runDetailTab === 'mapping' && (
            <DataTable
              rows={selectedMappedRows}
              emptyTitle="Mapping uygulanmadi"
              emptyText="Bu import run icinde kategori veya marka mapping uygulanmis satir yok."
              columns={[
                { key: 'row_number', label: 'Satir' },
                { key: 'sku', label: 'SKU' },
                { key: 'category_before', label: 'Kategori once' },
                { key: 'category_after', label: 'Kategori sonra' },
                { key: 'brand_before', label: 'Marka once' },
                { key: 'brand_after', label: 'Marka sonra' },
                { key: 'mapping_type', label: 'Tip', render: (row) => <StatusPill tone={row.mapping_type === 'exact' ? 'ready' : 'running'} label={row.mapping_type || '-'} /> },
              ]}
            />
          )}

          {runDetailTab === 'price' && (
            <DataTable
              rows={selectedPriceRows}
              emptyTitle="Fiyat degisimi yok"
              emptyText="Bu import run icinde fiyat kuraliyla degisen satir bulunmuyor."
              columns={[
                { key: 'row_number', label: 'Satir' },
                { key: 'sku', label: 'SKU' },
                { key: 'price_before', label: 'Once' },
                { key: 'price_after', label: 'Sonra' },
                { key: 'multiplier', label: 'Carpan' },
                { key: 'profit_rate', label: 'Kar %' },
                { key: 'rounding_mode', label: 'Yuvarlama' },
              ]}
            />
          )}

          {runDetailTab === 'stock' && (
            <DataTable
              rows={selectedStockRows}
              emptyTitle="Stok stratejisi islemi yok"
              emptyText="Bu import run icinde eksik urun icin pasife alma veya stok sifirlama uygulanmadi."
              columns={[
                { key: 'sku', label: 'SKU' },
                { key: 'action', label: 'Aksiyon', render: (row) => <StatusPill tone={row.action === 'zero_stock' ? 'running' : 'blocked'} label={stockActionLabel(row.action)} /> },
                { key: 'previous_stock', label: 'Onceki stok' },
                { key: 'new_stock', label: 'Yeni stok' },
              ]}
            />
          )}
        </section>
      )}
    </>
  );
}
