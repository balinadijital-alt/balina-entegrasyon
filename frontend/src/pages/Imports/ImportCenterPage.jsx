import { useEffect, useMemo, useState } from 'react';
import { Eye, Play, RotateCcw, Upload } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const importFields = {
  name: 'Urun adi',
  barcode: 'Barkod',
  sku: 'SKU',
  price: 'Fiyat',
  list_price: 'Liste fiyati',
  stock: 'Stok',
  brand: 'Marka',
  category: 'Kategori',
  description: 'Aciklama',
  image_urls: 'Gorseller',
  variant_group: 'Varyant grubu',
  variants: 'Varyant alanlari',
};

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

export function ImportCenterPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [xmlSources, setXmlSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [xmlForm, setXmlForm] = useState(xmlInitial);
  const [excelCompanyId, setExcelCompanyId] = useState('');
  const [excelSupplier, setExcelSupplier] = useState('');
  const [excelFile, setExcelFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [options, setOptions] = useState(defaultOptions);
  const [activeXmlSource, setActiveXmlSource] = useState(null);

  const headers = useMemo(() => preview?.headers || [], [preview]);

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

  const createXmlSource = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.xmlSources.create({ ...xmlForm, frequency_minutes: Number(xmlForm.frequency_minutes) });
      setXmlForm(xmlInitial);
      notify('success', 'XML kaynagi kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const previewExcel = async (event) => {
    event.preventDefault();
    if (!excelCompanyId || !excelFile) {
      setError('Excel onizleme icin firma ve dosya zorunludur.');
      return;
    }

    const body = new FormData();
    body.append('company_id', excelCompanyId);
    body.append('file', excelFile);
    await run(async () => {
      const response = await api.imports.previewExcel(body);
      setPreview(response);
      setMapping(response.suggested_mapping || {});
      setActiveXmlSource(null);
      notify('success', 'Excel onizleme hazirlandi.');
    }, { onError: (message) => notify('error', message) });
  };

  const queueExcel = async () => {
    if (!excelCompanyId || !excelFile || !mapping.sku) {
      setError('Yukleme icin firma, dosya ve SKU eslestirmesi zorunludur.');
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
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const previewXml = async (source) => {
    await run(async () => {
      const response = await api.xmlSources.preview(source.id, {});
      setPreview(response);
      setMapping(response.suggested_mapping || {});
      setActiveXmlSource(source);
      setExcelCompanyId(String(source.company_id));
      setExcelSupplier(source.supplier_name || '');
      notify('success', 'XML kategori/alan onizlemesi hazirlandi.');
    }, { onError: (message) => notify('error', message) });
  };

  const importXml = async (source) => {
    await run(async () => {
      const sourceMapping = activeXmlSource?.id === source.id ? mapping : (source.field_mapping || {});
      const response = await api.xmlSources.import(source.id, { field_mapping: sourceMapping, options, supplier_name: source.supplier_name });
      notify('success', response.message);
      await load();
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

  return (
    <>
      <PageHeader title="Toplu Urun Yukleme" />
      <section className="split">
        <form className="panel compact-panel" onSubmit={createXmlSource}>
          <h2>XML Kaynagi</h2>
          <Field label="Firma">
            <select value={xmlForm.company_id} onChange={(event) => setXmlForm({ ...xmlForm, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Kaynak Adi"><input value={xmlForm.name} onChange={(event) => setXmlForm({ ...xmlForm, name: event.target.value })} /></Field>
          <Field label="Tedarikci"><input value={xmlForm.supplier_name} onChange={(event) => setXmlForm({ ...xmlForm, supplier_name: event.target.value })} /></Field>
          <Field label="XML URL"><input value={xmlForm.url} onChange={(event) => setXmlForm({ ...xmlForm, url: event.target.value })} /></Field>
          <Field label="Kullanici Adi"><input value={xmlForm.username} onChange={(event) => setXmlForm({ ...xmlForm, username: event.target.value })} /></Field>
          <Field label="Sifre"><input type="password" value={xmlForm.password} onChange={(event) => setXmlForm({ ...xmlForm, password: event.target.value })} /></Field>
          <Field label="Guncelleme Sikligi">
            <select value={xmlForm.frequency_minutes} onChange={(event) => setXmlForm({ ...xmlForm, frequency_minutes: event.target.value })}>
              <option value="60">Saatlik</option>
              <option value="360">6 Saatte Bir</option>
              <option value="720">12 Saatte Bir</option>
              <option value="1440">Gunluk</option>
            </select>
          </Field>
          <button disabled={loading}>XML Kaynagi Ekle</button>
        </form>

        <form className="panel compact-panel" onSubmit={previewExcel}>
          <h2>Excel Yukleme Sihirbazi</h2>
          <Field label="Firma">
            <select value={excelCompanyId} onChange={(event) => setExcelCompanyId(event.target.value)}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Tedarikci"><input value={excelSupplier} onChange={(event) => setExcelSupplier(event.target.value)} /></Field>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setExcelFile(event.target.files[0])} />
          <button disabled={loading}><Upload size={16} /> Onizle</button>
        </form>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && <LoadingState label="Yukleme islemi hazirlaniyor..." />}

      {preview && (
        <section className="panel">
          <h2>Alan Eslestirme ve Onizleme</h2>
          <div className="mapping-grid">
            {Object.entries(importFields).map(([field, label]) => (
              <Field key={field} label={label}>
                <select value={mapping[field] || ''} onChange={(event) => setMapping({ ...mapping, [field]: event.target.value })}>
                  <option value="">Eslestirme yok</option>
                  {headers.map((header) => <option key={header} value={header}>{header}</option>)}
                </select>
              </Field>
            ))}
          </div>
          <div className="option-grid">
            <Field label="Eslesme Anahtari">
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
          <div className="import-preview">
            <div>
              <h3>Basarili Onizleme</h3>
              {preview.valid_rows.slice(0, 5).map((row) => <pre key={row.row}>{JSON.stringify(row.mapped, null, 2)}</pre>)}
            </div>
            <div>
              <h3>Hatali Satirlar</h3>
              {preview.invalid_rows.length === 0 ? <p className="ok-text">Hata yok</p> : preview.invalid_rows.map((row) => <p key={row.row} className="bad-text">Satir {row.row}: {row.message}</p>)}
            </div>
          </div>
          <div className="row-actions">
            {!activeXmlSource && <button type="button" onClick={queueExcel} disabled={loading || !excelFile}><Play size={16} /> Excel Yuklemeyi Baslat</button>}
            {activeXmlSource && <button type="button" onClick={() => importXml(activeXmlSource)} disabled={loading}><Play size={16} /> XML Yuklemeyi Baslat</button>}
            {activeXmlSource && <button type="button" onClick={saveXmlMapping} disabled={loading}>XML Eslestirmeyi Kaydet</button>}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>XML Kaynaklari</h2>
        <DataTable
          rows={xmlSources}
          columns={[
            { key: 'name', label: 'Kaynak' },
            { key: 'company', label: 'Firma', render: (row) => row.company?.name },
            { key: 'supplier_name', label: 'Tedarikci' },
            { key: 'frequency_minutes', label: 'Siklik' },
            { key: 'last_status', label: 'Son Durum', render: (row) => <span className={`badge ${row.last_status || 'unknown'}`}>{row.last_status || 'unknown'}</span> },
            { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" onClick={() => previewXml(row)}><Eye size={15} /> Onizle</button><button type="button" onClick={() => importXml(row)}><Play size={15} /> Yukle</button></div> },
          ]}
        />
      </section>

      <section className="panel">
        <h2>Yukleme Gecmisi</h2>
        <DataTable
          rows={runs}
          columns={[
            { key: 'id', label: 'ID' },
            { key: 'source_type', label: 'Kaynak' },
            { key: 'supplier_name', label: 'Tedarikci' },
            { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{row.status}</span> },
            { key: 'progress', label: 'Ilerleme', render: (row) => <div className="progress inline-progress"><span style={{ width: `${row.progress || 0}%` }} /></div> },
            { key: 'success_count', label: 'Basarili' },
            { key: 'error_count', label: 'Hatali' },
            { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" onClick={() => showRun(row.id)}><Eye size={15} /> Rapor</button><button type="button" onClick={() => retryImport(row.id)} disabled={!['failed', 'completed', 'completed_with_errors'].includes(row.status)}><RotateCcw size={15} /> Tekrar Dene</button></div> },
          ]}
        />
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
