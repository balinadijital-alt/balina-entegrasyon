import { useEffect, useMemo, useState } from 'react';
import { Plus, Save } from 'lucide-react';
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
      <section className="variant-layout">
        <form className="panel compact-panel" onSubmit={submit}>
          <h2>Yeni Varyant</h2>
          <Field label="Varyant Basligi">
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Renk" />
          </Field>
          <Field label="Degerler">
            <textarea value={form.values} onChange={(event) => setForm({ ...form, values: event.target.value })} placeholder="Siyah, Beyaz, Mavi" />
          </Field>
          <button disabled={loading}><Save size={16} /> Kaydet</button>
        </form>
        <section className="panel compact-panel">
          <h2>Ornekler</h2>
          {examples.map((example) => (
            <div className="soft-empty" key={example.name}>
              <strong>{example.name}</strong>
              <span>{example.values.join(', ')}</span>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => setForm({ name: 'Renk', values: 'Siyah, Beyaz, Mavi' })}><Plus size={16} /> Ornegi Kullan</button>
        </section>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <section className="panel">
          <h2>Kayitli Varyantlar</h2>
          <DataTable
            rows={rows}
            emptyTitle="Varyant yok"
            emptyText="Renk veya beden gibi bir varyant basligi ekleyerek baslayin."
            columns={[
              { key: 'name', label: 'Baslik' },
              { key: 'values', label: 'Degerler', render: (row) => Array.isArray(row.values) ? row.values.join(', ') : String(row.values || '-') },
              { key: 'created_at', label: 'Tarih' },
            ]}
          />
        </section>
      )}
    </>
  );
}
