import { useEffect, useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function emptyForm(config) {
  return config.fields.reduce((carry, field) => ({ ...carry, [field]: config.defaults?.[field] ?? '' }), {});
}

function normalizeValue(field, value) {
  if (['settings', 'rules', 'items', 'values', 'options', 'costs', 'filters', 'payload', 'xml_settings', 'variables'].includes(field)) {
    if (!value) return null;
    return typeof value === 'string' ? JSON.parse(value) : value;
  }

  if (['value', 'minimum_cart_amount', 'cart_total', 'rating', 'profit_rate', 'minimum_profit_amount', 'base_cost', 'commission_cost', 'tax_cost', 'shipping_cost', 'packaging_cost', 'ad_cost', 'rate', 'price', 'amount', 'discount_rate', 'balance', 'product_id', 'related_product_id', 'dealer_id', 'dealer_group_id', 'order_id'].includes(field)) {
    return value === '' ? null : Number(value);
  }

  if (['is_active', 'is_required', 'is_default', 'free_shipping'].includes(field)) {
    return Boolean(value);
  }

  return value;
}

export function ModulePage({ config }) {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(() => emptyForm(config));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    await run(async () => {
      const response = config.domain
        ? await api.domainModules.list(config.domain, config.module)
        : await api.modules.list(config.module);
      setRows(response.data || []);
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    setForm(emptyForm(config));
    load();
  }, [config.module]);

  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [row[config.primary], row[config.secondary], row.title, row.name, row.code].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !status || row.status === status;
    return matchesSearch && matchesStatus;
  }), [rows, search, status, config]);

  const submit = async (event) => {
    event.preventDefault();
    await run(async () => {
      const payload = Object.fromEntries(Object.entries(form).map(([field, value]) => [field, normalizeValue(field, value)]));
      if (config.domain) {
        await api.domainModules.create(config.domain, config.module, payload);
      } else {
        await api.modules.create(config.module, payload);
      }
      notify('success', 'Kayit olusturuldu.');
      setForm(emptyForm(config));
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const renderField = (field) => {
    const value = form[field] ?? '';
    if (['content', 'body', 'comment', 'description', 'settings', 'rules', 'items', 'values', 'options', 'costs', 'filters', 'payload', 'xml_settings', 'variables'].includes(field)) {
      return <textarea value={value} onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder={field.includes('settings') || field.includes('rules') ? '{"key":"value"}' : ''} />;
    }

    if (['status', 'type', 'channel', 'provider', 'scope', 'placement'].includes(field)) {
      return <input value={value} onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder={field} />;
    }

    if (['is_active', 'is_required', 'is_default', 'free_shipping'].includes(field)) {
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => setForm({ ...form, [field]: event.target.checked })} />;
    }

    const numeric = ['value', 'minimum_cart_amount', 'cart_total', 'rating', 'profit_rate', 'minimum_profit_amount', 'base_cost', 'commission_cost', 'tax_cost', 'shipping_cost', 'packaging_cost', 'ad_cost', 'rate', 'price', 'amount', 'discount_rate', 'balance', 'product_id', 'related_product_id', 'dealer_id', 'dealer_group_id', 'order_id'].includes(field);
    return <input type={numeric ? 'number' : 'text'} value={value} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />;
  };

  return (
    <>
      <PageHeader title={config.title} />
      <PageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={`${config.title} ara`}
        filters={(
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tum durumlar</option>
            <option value="draft">Taslak</option>
            <option value="active">Aktif</option>
            <option value="pending">Bekliyor</option>
            <option value="approved">Onayli</option>
            <option value="rejected">Reddedildi</option>
          </select>
        )}
      />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          {config.fields.map((field) => (
            <Field label={field} key={field}>{renderField(field)}</Field>
          ))}
          <button disabled={loading}><Save size={16} /> Kaydet</button>
        </form>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={filteredRows}
          emptyTitle="Kayit bulunamadi"
          emptyText="Yeni kayit ekleyin veya filtreleri temizleyin."
          columns={[
            { key: config.primary, label: 'Baslik', render: (row) => String(row[config.primary] ?? row.title ?? row.name ?? '-') },
            { key: config.secondary, label: 'Detay', render: (row) => typeof row[config.secondary] === 'object' ? JSON.stringify(row[config.secondary]) : String(row[config.secondary] ?? '-') },
            { key: 'status', label: 'Durum', render: (row) => row.status ? <span className={`badge ${row.status}`}>{row.status}</span> : (row.is_active === false ? 'Pasif' : 'Aktif') },
            { key: 'created_at', label: 'Tarih' },
          ]}
        />
      )}
    </>
  );
}
