import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Database, Eye, FileSpreadsheet, Link2, Play, RotateCcw, Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
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

export function ImportCenterPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [xmlSources, setXmlSources] = useState([]);
  const [runs, setRuns] = useState([]);
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

  const headers = useMemo(() => preview?.headers || [], [preview]);
  const validRows = preview?.valid_rows || [];
  const invalidRows = preview?.invalid_rows || [];
  const mappedFieldCount = Object.values(mapping).filter(Boolean).length;
  const missingRequiredMappings = requiredFields.filter((field) => !mapping[field]);
  const hasIdentifierMapping = Boolean(mapping.sku || mapping.barcode);
  const blockingMappingMissing = !hasIdentifierMapping || (!options.update_stock_price_only && !mapping.name);
  const activeCompanyId = sourceType === 'xml' ? xmlForm.company_id : excelCompanyId;
  const importReady = sourceType === 'xml'
    ? Boolean(activeXmlSource && hasIdentifierMapping)
    : Boolean(excelCompanyId && excelFile && hasIdentifierMapping);

  const load = async () => {
    await run(async () => {
      const [companyResponse, sourceResponse, runResponse] = await Promise.all([
        api.companies.list(),
        api.xmlSources.list(),
        api.imports.runs(),
      ]);
      setCompanies(companyResponse.data || []);
      setXmlSources(sourceResponse.data || []);
      setRuns(runResponse.data || []);
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
    setMapping(source?.field_mapping || {});
    setOptions({ ...defaultOptions, ...(source?.options || {}) });
    resetPreview(false);
  };

  const saveXmlSource = async (event) => {
    event.preventDefault();
    if (!xmlForm.company_id || !xmlForm.name || !xmlForm.url) {
      setError('XML kaynagi icin firma, kaynak adi ve URL zorunludur.');
      return;
    }

    await run(async () => {
      const payload = { ...xmlForm, frequency_minutes: Number(xmlForm.frequency_minutes), field_mapping: mapping, options };
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
    Object.entries(mapping).forEach(([key, value]) => body.append(`field_mapping[${key}]`, value || ''));
    await run(async () => {
      const response = await api.imports.previewExcel(body);
      setPreview(response);
      setMapping(response.suggested_mapping || {});
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
      const response = await api.xmlSources.preview(activeXmlSource.id, { field_mapping: mapping });
      setPreview(response);
      setMapping(response.suggested_mapping || {});
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
    Object.entries(mapping).forEach(([key, value]) => body.append(`field_mapping[${key}]`, value || ''));
    Object.entries(options).forEach(([key, value]) => body.append(`options[${key}]`, value));

    await run(async () => {
      const response = await api.imports.queueExcel(body);
      setLastQueuedRunId(response.import_run_id);
      notify('success', response.message);
      await load();
      setStep(7);
    }, { onError: (message) => notify('error', message) });
  };

  const importXml = async (source = activeXmlSource) => {
    const effectiveMapping = Object.keys(mapping || {}).length > 0 ? mapping : (source?.field_mapping || {});
    const hasXmlIdentifier = Boolean(effectiveMapping.sku || effectiveMapping.barcode);
    if (!source || !hasXmlIdentifier) {
      setError('XML import icin kaynak ve SKU veya barkod eslestirmesi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.xmlSources.import(source.id, { field_mapping: effectiveMapping, options, supplier_name: source.supplier_name });
      setLastQueuedRunId(response.import_run_id);
      notify('success', response.message);
      await load();
      setStep(7);
    }, { onError: (message) => notify('error', message) });
  };

  const saveXmlMapping = async () => {
    if (!activeXmlSource) return;
    await run(async () => {
      await api.xmlSources.update(activeXmlSource.id, { field_mapping: mapping, options });
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
      setSelectedRun(await api.imports.showRun(runId));
    }, { onError: (message) => notify('error', message) });
  };

  const setOption = (key, value) => setOptions((current) => ({ ...current, [key]: value }));
  const runById = (id) => runs.find((item) => Number(item.id) === Number(id));
  const latestRun = lastQueuedRunId ? runById(lastQueuedRunId) : runs[0];

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
                  <div className="soft-empty"><strong>{excelFile?.name || 'Dosya secilmedi'}</strong><span>XLSX, XLS veya CSV formatlari desteklenir.</span></div>
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
                <div className="soft-empty"><strong>{sourceTypeLabel(sourceType)}</strong><span>{sourceType === 'xml' ? (activeXmlSource?.url || xmlForm.url || '-') : (excelFile?.name || '-')}</span></div>
                <div className="soft-empty"><strong>{companies.find((company) => String(company.id) === String(activeCompanyId))?.name || 'Firma secilmedi'}</strong><span>Import firmasi</span></div>
                <div className="soft-empty"><strong>{sourceType === 'xml' ? (activeXmlSource?.supplier_name || xmlForm.supplier_name || '-') : (excelSupplier || '-')}</strong><span>Tedarikci</span></div>
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
              {!preview ? <div className="soft-empty">Alan eslestirme icin once on kontrol calistirin.</div> : (
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
              {!preview ? <div className="soft-empty">Onizleme bulunamadi.</div> : (
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
                  <select value={options.match_by} onChange={(event) => setOption('match_by', event.target.value)}>
                    <option value="sku">SKU</option>
                    <option value="barcode">Barkod</option>
                  </select>
                </Field>
                <label><input type="checkbox" checked={options.update_existing} onChange={(event) => setOption('update_existing', event.target.checked)} /> Ayni SKU/Barkod varsa guncelle</label>
                <label><input type="checkbox" checked={options.deactivate_missing} onChange={(event) => setOption('deactivate_missing', event.target.checked)} /> Olmayan urunleri pasife al</label>
                <label><input type="checkbox" checked={options.update_stock_price_only} onChange={(event) => setOption('update_stock_price_only', event.target.checked)} /> Sadece stok/fiyat guncelle</label>
                <label><input type="checkbox" checked={options.download_images} onChange={(event) => setOption('download_images', event.target.checked)} /> Gorsel URL indir</label>
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
        <section className="panel">
          <h2>XML Kaynaklari</h2>
          <DataTable
            rows={xmlSources}
            emptyTitle="XML kaynagi yok"
            emptyText="Tedarikci XML URL'si ekleyerek periyodik urun aktarimina baslayin."
            columns={[
              { key: 'name', label: 'Kaynak' },
              { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
              { key: 'supplier_name', label: 'Tedarikci' },
              { key: 'frequency_minutes', label: 'Siklik', render: (row) => `${row.frequency_minutes || 1440} dk` },
              { key: 'last_import_at', label: 'Son Calisma', render: (row) => row.last_import_at || '-' },
              { key: 'last_status', label: 'Sonuc', render: (row) => <span className={`status-pill ${statusClass(row.last_status)}`}>{statusLabel(row.last_status)}</span> },
              { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" onClick={() => { setSourceType('xml'); selectXmlSource(row.id); setStep(2); }}><Eye size={15} /> Onizle</button><button type="button" onClick={() => importXml(row)}><Play size={15} /> Calistir</button></div> },
            ]}
          />
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
              { key: 'status', label: 'Durum', render: (row) => <span className={`status-pill ${statusClass(row.status)}`}>{statusLabel(row.status)}</span> },
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
        <section className="panel">
          <h2>Hata Raporu #{selectedRun.id}</h2>
          <div className="queue-summary">
            <div><span>Toplam</span><strong>{selectedRun.total_rows}</strong></div>
            <div><span>Basarili</span><strong>{selectedRun.success_count}</strong></div>
            <div><span>Hatali</span><strong>{selectedRun.error_count}</strong></div>
            <div><span>Yeni</span><strong>{selectedRun.created_count}</strong></div>
            <div><span>Guncel</span><strong>{selectedRun.updated_count}</strong></div>
          </div>
          <DataTable
            rows={selectedRun.errors || []}
            emptyTitle="Hata yok"
            emptyText="Bu import kaydinda satir bazli hata bulunmuyor."
            columns={[
              { key: 'row_number', label: 'Satir' },
              { key: 'sku', label: 'SKU' },
              { key: 'barcode', label: 'Barkod' },
              { key: 'message', label: 'Hata' },
            ]}
          />
        </section>
      )}
    </>
  );
}
