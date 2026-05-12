import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Save, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const initialForm = {
  company_id: '',
  marketplace_code: 'trendyol',
  local_category: '',
  external_category_id: '',
  external_category_name: '',
  attributes: {},
};

function mappingForm(record) {
  return {
    company_id: record.company_id || '',
    marketplace_code: record.marketplace_code || 'trendyol',
    local_category: record.local_category || '',
    external_category_id: record.external_category_id || '',
    external_category_name: record.external_category_name || '',
    attributes: record.attributes || {},
  };
}

function catalogCategories(result) {
  const categories = result?.categories || result?.data || result?.raw?.categories || [];
  return Array.isArray(categories) ? categories : [];
}

export function CategoryMappingPage() {
  const [searchParams] = useSearchParams();
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [marketplaces, setMarketplaces] = useState([]);
  const [products, setProducts] = useState([]);
  const [resourceCategories, setResourceCategories] = useState([]);
  const [resourceAttributes, setResourceAttributes] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [form, setForm] = useState({ ...initialForm, local_category: searchParams.get('category') || '' });
  const [editingId, setEditingId] = useState(null);
  const [categoryAttributes, setCategoryAttributes] = useState([]);
  const [catalogResult, setCatalogResult] = useState(null);

  const selectedAccount = useMemo(() => marketplaces.find((marketplace) => (
    marketplace.code === form.marketplace_code && String(marketplace.company_id) === String(form.company_id)
  )) || marketplaces.find((marketplace) => marketplace.code === form.marketplace_code), [marketplaces, form.company_id, form.marketplace_code]);
  const productCategories = useMemo(() => [...new Set(products
    .filter((product) => !form.company_id || String(product.company_id) === String(form.company_id))
    .map((product) => product.category)
    .filter(Boolean))], [products, form.company_id]);
  const localCategories = useMemo(() => {
    const resourceNames = resourceCategories.map((category) => category.name).filter(Boolean);
    return resourceNames.length > 0 ? resourceNames : productCategories;
  }, [resourceCategories, productCategories]);
  const affectedProductCount = products.filter((product) => (
    String(product.company_id) === String(form.company_id) && product.category === form.local_category
  )).length;

  const load = async () => {
    await run(async () => {
      const [companyResponse, marketplaceResponse, mappingResponse, productResponse, categoryResponse, attributeResponse] = await Promise.all([
        api.companies.list(),
        api.marketplaces.list(),
        api.categoryMappings.list(),
        api.products.list(),
        api.catalogResources.list({ type: 'categories', active: 1 }),
        api.catalogResources.list({ type: 'attributes', active: 1 }),
      ]);
      setCompanies(companyResponse.data || []);
      setMarketplaces(marketplaceResponse.data || []);
      setMappings(mappingResponse.data || []);
      setProducts(productResponse.data || []);
      setResourceCategories(categoryResponse.data || []);
      setResourceAttributes(attributeResponse.data || []);
      setForm((current) => ({
        ...current,
        company_id: current.company_id || companyResponse.data?.[0]?.id || '',
      }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setAttributeMapping = (key, value) => {
    setForm((current) => {
      const attributes = { ...(current.attributes || {}) };
      if (value) attributes[key] = value;
      else delete attributes[key];
      return { ...current, attributes };
    });
  };

  const fetchMarketplaceCatalog = async () => {
    if (!selectedAccount) {
      notify('error', 'Once firma ve pazaryeri hesabi seciniz.');
      return;
    }

    await run(async () => {
      const response = form.marketplace_code === 'trendyol'
        ? await api.marketplaces.trendyolCategories(selectedAccount.id)
        : await api.marketplaces.hepsiburadaCategories(selectedAccount.id);
      setCatalogResult(response);
      notify('success', 'Pazaryeri kategori agaci alindi.');
    }, { onError: (message) => notify('error', message) });
  };

  const fetchAttributes = async () => {
    if (!selectedAccount || !form.external_category_id) {
      notify('error', 'Kategori ozellikleri icin pazaryeri hesabi ve kategori ID zorunludur.');
      return;
    }
    if (form.marketplace_code !== 'trendyol') {
      setCategoryAttributes([]);
      notify('success', 'Hepsiburada icin ozellik eslesmeleri form alanindan yonetilir.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolCategoryAttributes(selectedAccount.id, form.external_category_id);
      const attributes = response.attributes || response.raw?.categoryAttributes || [];
      setCategoryAttributes(attributes);
      notify('success', `${attributes.length} kategori ozelligi bulundu.`);
    }, { onError: (message) => notify('error', message) });
  };

  const save = async (event) => {
    event.preventDefault();

    await run(async () => {
      const payload = { ...form, attributes: form.attributes || {} };
      const response = editingId ? await api.categoryMappings.update(editingId, payload) : await api.categoryMappings.create(payload);
      notify('success', editingId ? 'Kategori eslesmesi guncellendi.' : 'Kategori eslesmesi sablon olarak kaydedildi.');
      setEditingId(null);
      setForm(mappingForm(response));
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const remove = async (id) => {
    await run(async () => {
      await api.categoryMappings.remove(id);
      notify('success', 'Kategori eslesmesi silindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Kategori Eslestirme" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && mappings.length === 0 ? <LoadingState /> : null}

      <section className="state-box category-help-box">
        <span>Urunleri pazaryerine gondermeden once kategori eslestirmesi yapilmalidir. Bir eslesme kaydettiginizde ayni kategorideki urunler gonderime hazirlik kontrolunde ilerler.</span>
      </section>

      <section className="mapping-board">
        <section className="panel compact-panel">
          <h2>Benim Kategorilerim</h2>
          {localCategories.length === 0 ? <div className="soft-empty">Henuz urun kategorisi yok. Once urun ekleyin veya toplu urun yukleyin.</div> : localCategories.map((category) => (
            <button type="button" className={form.local_category === category ? 'mapping-category active' : 'mapping-category'} key={category} onClick={() => setValue('local_category', category)}>
              <span>{category}</span>
              <small>{products.filter((product) => product.category === category).length} urun</small>
            </button>
          ))}
        </section>

        <form className="panel compact-panel" onSubmit={save}>
          <h2>Pazaryeri Kategori Agaci</h2>
          <div className="soft-empty success-empty">
            Bu eslesme kaydedilirse {affectedProductCount} urun gonderime bir adim daha hazir olur.
          </div>
          <div className="form-grid">
            <Field label="Firma">
              <select value={form.company_id} onChange={(event) => setValue('company_id', event.target.value)}>
                <option value="">Firma seciniz</option>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Pazaryeri">
              <select value={form.marketplace_code} onChange={(event) => setValue('marketplace_code', event.target.value)}>
                <option value="trendyol">Trendyol</option>
                <option value="hepsiburada">Hepsiburada</option>
              </select>
            </Field>
            <Field label="Yerel Kategori">
              <select value={form.local_category} onChange={(event) => setValue('local_category', event.target.value)}>
                <option value="">Kategori seciniz</option>
                {localCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </Field>
            <Field label="Pazaryeri Kategori ID"><input value={form.external_category_id} onChange={(event) => setValue('external_category_id', event.target.value)} /></Field>
            <Field label="Pazaryeri Kategori Adi"><input value={form.external_category_name} onChange={(event) => setValue('external_category_name', event.target.value)} /></Field>
          </div>
          <div className="wizard-actions inline-actions">
            <button type="button" className="secondary-button" disabled={loading} onClick={fetchMarketplaceCatalog}><RefreshCw size={16} /> Kategori Agacini Getir</button>
            <button type="button" className="secondary-button" disabled={loading} onClick={fetchAttributes}>Zorunlu Ozellikleri Getir</button>
            <button disabled={loading}><Save size={16} /> Sablon Kaydet</button>
          </div>
          {catalogResult && (
            <div className="category-list">
              {catalogCategories(catalogResult).slice(0, 12).map((category) => (
                <span key={category.id || category.categoryId || category.name}>{category.name || category.categoryName || category.title}</span>
              ))}
            </div>
          )}
        </form>

        <section className="panel compact-panel">
          <h2>Zorunlu Ozellik ve Ozet</h2>
          <div className="mapping-ready-card">
            <strong>{affectedProductCount}</strong>
            <span>urun bu eslesmeden etkilenir</span>
          </div>
          {resourceAttributes.length === 0 ? (
            <div className="soft-empty">Nitelik bulunamadi. Nitelikler / Ozellikler sayfasindan Renk, Beden, Materyal gibi alanlari ekleyin.</div>
          ) : resourceAttributes.map((attribute) => (
            <div className="attribute-row" key={attribute.id}>
              <strong>{attribute.name}</strong>
              <select value={form.attributes?.[attribute.name] || ''} onChange={(event) => setAttributeMapping(attribute.name, event.target.value)}>
                <option value="">Eslesme seciniz</option>
                <option value="brand">Marka</option>
                <option value="variant">Varyant</option>
                <option value="fixed">Sabit Deger</option>
                {Array.isArray(attribute.values) ? attribute.values.map((value) => <option key={value} value={value}>{value}</option>) : null}
              </select>
            </div>
          ))}
          {categoryAttributes.length === 0 ? (
            <div className="soft-empty">Kategori ID girip zorunlu ozellikleri getirin. Eslesme yoksa urun gonderimi engellenir.</div>
          ) : categoryAttributes.map((attribute) => (
            <div className="attribute-row" key={attribute.attributeId || attribute.attribute?.id}>
              <strong>{attribute.attributeName || attribute.attribute?.name || attribute.attributeId}</strong>
              <span>{attribute.required ? 'Zorunlu' : 'Opsiyonel'}</span>
            </div>
          ))}
        </section>
      </section>

      <section className="panel">
        <h2>Kayitli Eslesmeler</h2>
        <DataTable
          rows={mappings}
          emptyTitle="Kategori eslesmesi yok"
          emptyText="Ilk eslesme sablonunu kaydederek urun gonderim akisini acin."
          columns={[
            { key: 'company', label: 'Firma', render: (row) => companies.find((company) => company.id === row.company_id)?.name || row.company_id },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'local_category', label: 'Yerel Kategori' },
            { key: 'external_category_id', label: 'Pazaryeri Kategori' },
            { key: 'external_category_name', label: 'Kategori Adi' },
            {
              key: 'actions',
              label: 'Islem',
              render: (row) => (
                <div className="row-actions">
                  <button type="button" className="secondary-button" onClick={() => { setEditingId(row.id); setForm(mappingForm(row)); }}>Duzenle</button>
                  <button type="button" className="secondary-button" disabled={loading} onClick={() => remove(row.id)}><Trash2 size={14} /> Sil</button>
                </div>
              ),
            },
          ]}
        />
      </section>
    </>
  );
}
