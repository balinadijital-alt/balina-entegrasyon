import { useEffect, useMemo, useState } from 'react';
import { Calculator, Save } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const initialForm = {
  marketplace: 'trendyol',
  category: '',
  brand: '',
  profit_rate: 25,
  fixed_fee: 0,
  shipping_cost: 0,
  commission_rate: 15,
  minimum_profit_amount: 0,
};

export function PricingRulesCustomerPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [baseCost, setBaseCost] = useState(100);

  const load = async () => {
    await run(async () => {
      const response = await api.domainModules.list('pricing', 'profit-rules');
      setRows(response.data || []);
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    load();
  }, []);

  const salePrice = useMemo(() => {
    const cost = Number(baseCost || 0);
    const profit = Math.max(Number(form.minimum_profit_amount || 0), cost * (Number(form.profit_rate || 0) / 100));
    const commission = cost * (Number(form.commission_rate || 0) / 100);
    return cost + profit + commission + Number(form.fixed_fee || 0) + Number(form.shipping_cost || 0);
  }, [baseCost, form]);

  const submit = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.domainModules.create('pricing', 'profit-rules', {
        scope: form.marketplace,
        scope_value: [form.category, form.brand].filter(Boolean).join(' / ') || form.marketplace,
        profit_rate: Number(form.profit_rate || 0),
        minimum_profit_amount: Number(form.minimum_profit_amount || 0),
        costs: {
          fixed_fee: Number(form.fixed_fee || 0),
          shipping_cost: Number(form.shipping_cost || 0),
          commission_rate: Number(form.commission_rate || 0),
          category: form.category,
          brand: form.brand,
        },
      });
      notify('success', 'Fiyat kurali kaydedildi.');
      setForm(initialForm);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Fiyat Kurallari" description="Pazaryeri, kategori ve markaya gore satis fiyatinizi otomatik hesaplayacak kurallari yonetin." />
      <section className="pricing-layout">
        <form className="panel compact-panel" onSubmit={submit}>
          <h2>Kural Olustur</h2>
          <div className="form-grid">
            <Field label="Pazaryeri"><select value={form.marketplace} onChange={(event) => setForm({ ...form, marketplace: event.target.value })}><option value="trendyol">Trendyol</option><option value="hepsiburada">Hepsiburada</option></select></Field>
            <Field label="Kategori"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
            <Field label="Marka"><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
            <Field label="Kar Orani %"><input type="number" value={form.profit_rate} onChange={(event) => setForm({ ...form, profit_rate: event.target.value })} /></Field>
            <Field label="Sabit Ek Ucret"><input type="number" value={form.fixed_fee} onChange={(event) => setForm({ ...form, fixed_fee: event.target.value })} /></Field>
            <Field label="Kargo Maliyeti"><input type="number" value={form.shipping_cost} onChange={(event) => setForm({ ...form, shipping_cost: event.target.value })} /></Field>
            <Field label="Komisyon %"><input type="number" value={form.commission_rate} onChange={(event) => setForm({ ...form, commission_rate: event.target.value })} /></Field>
            <Field label="Minimum Kar"><input type="number" value={form.minimum_profit_amount} onChange={(event) => setForm({ ...form, minimum_profit_amount: event.target.value })} /></Field>
          </div>
          <button disabled={loading}><Save size={16} /> Kaydet</button>
        </form>
        <section className="panel compact-panel simulation-card">
          <h2>Fiyat Simulasyonu</h2>
          <Field label="Alis Fiyati"><input type="number" value={baseCost} onChange={(event) => setBaseCost(event.target.value)} /></Field>
          <div className="setup-progress">
            <Calculator size={22} />
            <strong>{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(salePrice)}</strong>
            <span>Tahmini satis fiyati</span>
          </div>
        </section>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <section className="panel">
          <h2>Kayitli Kurallar</h2>
          <DataTable
            rows={rows}
            emptyTitle="Fiyat kurali yok"
            emptyText="Ilk kuralinizi ekleyerek pazaryeri fiyatlandirmasini standartlastirin."
            columns={[
              { key: 'scope', label: 'Pazaryeri' },
              { key: 'scope_value', label: 'Kapsam' },
              { key: 'profit_rate', label: 'Kar Orani' },
              { key: 'minimum_profit_amount', label: 'Minimum Kar' },
            ]}
          />
        </section>
      )}
    </>
  );
}
