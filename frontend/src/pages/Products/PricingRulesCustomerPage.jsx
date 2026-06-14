import { useEffect, useMemo, useState } from 'react';
import { Calculator, CircleDollarSign, Percent, Plus, Save, Search, SlidersHorizontal, Store } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
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
  const [search, setSearch] = useState('');
  const [marketplaceFilter, setMarketplaceFilter] = useState('');

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

  const filteredRows = useMemo(() => rows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [row.scope, row.scope_value, row.profit_rate, row.minimum_profit_amount].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesMarketplace = !marketplaceFilter || row.scope === marketplaceFilter;
    return matchesSearch && matchesMarketplace;
  }), [marketplaceFilter, rows, search]);

  const marketplaces = useMemo(() => Array.from(new Set(rows.map((row) => row.scope).filter(Boolean))), [rows]);
  const averageProfit = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + Number(row.profit_rate || 0), 0) / rows.length)
    : Number(form.profit_rate || 0);

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
      <ReferenceModuleNav section="products" />

      <section className="product-tool-hero pricing">
        <div>
          <span>Fiyat motoru</span>
          <h2>Pazaryeri, kategori ve marka bazli kar kurallarini netlestirin.</h2>
          <p>Komisyon, kargo, sabit ucret ve minimum kar etkisini kaydetmeden once sag panelde simule edin.</p>
        </div>
        <button type="button" onClick={() => document.getElementById('pricing-rule-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Plus size={18} /> Kural Olustur
        </button>
      </section>

      <section className="product-tool-summary">
        <div><Store size={20} /><span>Kural sayisi</span><strong>{rows.length}</strong><small>Kayitli fiyat kurali</small></div>
        <div><Percent size={20} /><span>Ortalama kar</span><strong>%{averageProfit}</strong><small>Kayitli kurallar</small></div>
        <div><CircleDollarSign size={20} /><span>Simule fiyat</span><strong>{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(salePrice)}</strong><small>Guncel forma gore</small></div>
      </section>

      <section className="product-tool-filter">
        <div className="product-tool-filter-title">
          <div>
            <span><SlidersHorizontal size={16} /> Filtreleme</span>
            <strong>Fiyat kurallarini bulun</strong>
          </div>
          <small>Pazaryeri, kategori, marka veya kar orani ile arama yapin.</small>
        </div>
        <div className="product-tool-filter-grid">
          <label className="product-tool-search">
            <span>Arama</span>
            <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Trendyol, kategori, marka veya oran ara" /></div>
          </label>
          <label>
            <span>Pazaryeri</span>
            <select value={marketplaceFilter} onChange={(event) => setMarketplaceFilter(event.target.value)}>
              <option value="">Tum pazaryerleri</option>
              {marketplaces.map((marketplace) => <option value={marketplace} key={marketplace}>{marketplace}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      <section className="product-tool-layout">
        <div className="product-tool-table">
          {loading && rows.length === 0 ? <LoadingState /> : (
            <DataTable
              rows={filteredRows}
              emptyTitle="Fiyat kurali yok"
              emptyText="Ilk kuralinizi ekleyerek pazaryeri fiyatlandirmasini standartlastirin."
              columns={[
                { key: 'scope', label: 'Pazaryeri' },
                { key: 'scope_value', label: 'Kapsam' },
                { key: 'profit_rate', label: 'Kar Orani', render: (row) => `%${row.profit_rate || 0}` },
                { key: 'minimum_profit_amount', label: 'Minimum Kar' },
              ]}
            />
          )}
        </div>
        <aside className="product-tool-form pricing" id="pricing-rule-form">
          <div className="product-tool-form-title">
            <div>
              <span><Calculator size={16} /> Fiyat simulasyonu</span>
              <strong>{new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(salePrice)}</strong>
            </div>
            <small>Tahmini satis fiyati formdaki kurala gore hesaplanir.</small>
          </div>
          <Field label="Alis Fiyati"><input type="number" value={baseCost} onChange={(event) => setBaseCost(event.target.value)} /></Field>
          <form className="form-grid" onSubmit={submit}>
            <Field label="Pazaryeri"><select value={form.marketplace} onChange={(event) => setForm({ ...form, marketplace: event.target.value })}><option value="trendyol">Trendyol</option><option value="hepsiburada">Hepsiburada</option></select></Field>
            <Field label="Kategori"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
            <Field label="Marka"><input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></Field>
            <Field label="Kar Orani %"><input type="number" value={form.profit_rate} onChange={(event) => setForm({ ...form, profit_rate: event.target.value })} /></Field>
            <Field label="Sabit Ek Ucret"><input type="number" value={form.fixed_fee} onChange={(event) => setForm({ ...form, fixed_fee: event.target.value })} /></Field>
            <Field label="Kargo Maliyeti"><input type="number" value={form.shipping_cost} onChange={(event) => setForm({ ...form, shipping_cost: event.target.value })} /></Field>
            <Field label="Komisyon %"><input type="number" value={form.commission_rate} onChange={(event) => setForm({ ...form, commission_rate: event.target.value })} /></Field>
            <Field label="Minimum Kar"><input type="number" value={form.minimum_profit_amount} onChange={(event) => setForm({ ...form, minimum_profit_amount: event.target.value })} /></Field>
            <button disabled={loading}><Save size={16} /> Kaydet</button>
          </form>
        </aside>
      </section>
    </>
  );
}
