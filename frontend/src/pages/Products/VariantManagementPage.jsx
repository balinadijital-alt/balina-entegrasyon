import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Layers, Plus, Save, Search, SlidersHorizontal, Tags } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const initialForm = { name: '', values: '' };

function parseValues(values) {
  return values.split(',').map((value) => value.trim()).filter(Boolean);
}

export function VariantManagementPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState('');

  const load = async () => {
    await run(async () => {
      const response = await api.domainModules.list('catalog', 'product-variant-options');
      setRows(response.data || []);
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    load();
  }, []);

  const examples = useMemo(() => [
    { name: 'Renk', values: ['Siyah', 'Beyaz', 'Mavi'] },
    { name: 'Beden', values: ['S', 'M', 'L', 'XL'] },
  ], []);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const values = Array.isArray(row.values) ? row.values.join(' ') : String(row.values || '');
    return !query || [row.name, values].some((value) => String(value || '').toLowerCase().includes(query));
  }), [rows, search]);

  const valueCount = useMemo(() => rows.reduce((sum, row) => {
    if (Array.isArray(row.values)) return sum + row.values.length;
    return sum + parseValues(String(row.values || '')).length;
  }, 0), [rows]);

  const submit = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.domainModules.create('catalog', 'product-variant-options', {
        name: form.name,
        values: parseValues(form.values),
      });
      setForm(initialForm);
      notify('success', 'Varyant kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader
        title="Varyant Yonetimi"
        description="Renk, beden gibi tekrar kullanacaginiz varyant basliklarini ve degerlerini yonetin."
      />
      <ReferenceModuleNav section="products" />

      <section className="product-tool-hero">
        <div>
          <span>Katalog varyant sozlugu</span>
          <h2>Renk, beden, numara gibi tekrar kullanilan secenekleri standartlastirin.</h2>
          <p>Varyant basliklari urun ekleme, pazaryeri attribute eslestirme ve child varyant hazirligi icin ortak kaynak gibi calisir.</p>
        </div>
        <button type="button" onClick={() => document.getElementById('variant-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Plus size={18} /> Yeni Varyant
        </button>
      </section>

      <section className="product-tool-summary">
        <div><Layers size={20} /><span>Varyant basligi</span><strong>{rows.length}</strong><small>Kayitli baslik sayisi</small></div>
        <div><Tags size={20} /><span>Deger sayisi</span><strong>{valueCount}</strong><small>Toplam varyant degeri</small></div>
        <div><CheckCircle2 size={20} /><span>Gorunen liste</span><strong>{filteredRows.length}</strong><small>Arama sonucu</small></div>
      </section>

      <section className="product-tool-filter">
        <div className="product-tool-filter-title">
          <div>
            <span><SlidersHorizontal size={16} /> Filtreleme</span>
            <strong>Varyant sozlugunu bulun</strong>
          </div>
          <small>Baslik veya deger uzerinden arama yapin.</small>
        </div>
        <label className="product-tool-search">
          <span>Arama</span>
          <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Renk, beden, siyah veya XL ara" /></div>
        </label>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      <section className="product-tool-layout">
        <div className="product-tool-table">
          {loading && rows.length === 0 ? <LoadingState /> : (
            <DataTable
              rows={filteredRows}
              emptyTitle="Varyant yok"
              emptyText="Renk veya beden gibi bir varyant basligi ekleyerek baslayin."
              columns={[
                { key: 'name', label: 'Baslik' },
                { key: 'values', label: 'Degerler', render: (row) => Array.isArray(row.values) ? row.values.join(', ') : String(row.values || '-') },
                { key: 'created_at', label: 'Tarih' },
              ]}
            />
          )}
        </div>
        <aside className="product-tool-form" id="variant-create-form">
          <div className="product-tool-form-title">
            <div>
              <span><Plus size={16} /> Yeni varyant</span>
              <strong>Varyant Basligi</strong>
            </div>
            <small>Degerleri virgul ile ayirarak girin.</small>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <Field label="Varyant Basligi">
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Renk" />
            </Field>
            <Field label="Degerler">
              <textarea value={form.values} onChange={(event) => setForm({ ...form, values: event.target.value })} placeholder="Siyah, Beyaz, Mavi" />
            </Field>
            <button disabled={loading}><Save size={16} /> Kaydet</button>
          </form>
          <div className="product-tool-examples">
            <span>Hazir ornekler</span>
            {examples.map((example) => (
              <button type="button" key={example.name} onClick={() => setForm({ name: example.name, values: example.values.join(', ') })}>
                <strong>{example.name}</strong>
                <small>{example.values.join(', ')}</small>
              </button>
            ))}
          </div>
        </aside>
      </section>
    </>
  );
}
