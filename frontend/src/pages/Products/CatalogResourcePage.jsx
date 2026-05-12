import { useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const configs = {
  categories: {
    title: 'Kategoriler',
    description: 'Urunleri duzenli tutmak ve pazaryeri eslestirmesine hazirlamak icin kategori agacinizi yonetin.',
    fields: ['parent_id', 'name', 'sort_order', 'image_url', 'description', 'seo_title', 'seo_description', 'is_active'],
    empty: 'Ilk kategorinizi ekleyerek urun katalog yapisini olusturun.',
  },
  brands: {
    title: 'Markalar',
    description: 'Marka logolari, aciklamalari ve SEO bilgileriyle urunlerinizi daha kolay yonetin.',
    fields: ['name', 'image_url', 'description', 'seo_title', 'seo_description', 'is_active'],
    empty: 'Ilk markanizi ekleyerek urun formunda secilebilir hale getirin.',
  },
  attributes: {
    title: 'Nitelikler / Ozellikler',
    description: 'Renk, beden, materyal gibi urun ozelliklerini ve degerlerini yonetin.',
    fields: ['name', 'values', 'is_active'],
    empty: 'Renk veya beden gibi bir ozellik basligi ekleyin.',
  },
  tags: {
    title: 'Etiketler',
    description: 'Yeni Urun, Cok Satan, Kampanyali gibi etiketleri urunlerde kullanin.',
    fields: ['name', 'color', 'icon', 'is_active'],
    empty: 'Ilk etiketi ekleyerek urunleri kolayca gruplamaya baslayin.',
  },
  suppliers: {
    title: 'Tedarikciler',
    description: 'Tedarikci bilgileri, XML kaynagi, iskonto ve varsayilan kar oranlarini yonetin.',
    fields: ['name', 'contact_name', 'phone', 'email', 'xml_url', 'discount_rate', 'default_profit_rate', 'is_active'],
    empty: 'Ilk tedarikcinizi ekleyerek urun ve XML yukleme akisina baglayin.',
  },
  'tax-rates': {
    title: 'KDV Oranlari',
    description: 'Urun formunda kullanilacak KDV oranlarini yonetin.',
    fields: ['name', 'rate', 'is_active'],
    empty: 'KDV orani ekleyerek urun formunda secilebilir hale getirin.',
  },
  units: {
    title: 'Birimler',
    description: 'Adet, paket, metre, m2, kg gibi satis birimlerini yonetin.',
    fields: ['name', 'code', 'is_active'],
    empty: 'Ilk birimi ekleyerek urun formunda kullanin.',
  },
  defaults: {
    title: 'KDV / Birim / Desi Ayarlari',
    description: 'Varsayilan KDV, birim, desi ve agirlik bilgilerini belirleyin.',
    fields: ['name', 'vat_rate', 'unit', 'dimensional_weight', 'weight', 'is_active'],
    empty: 'Varsayilan ayar ekleyerek urun formunu hizlandirin.',
  },
};

function initialForm(type) {
  return {
    company_id: '',
    parent_id: '',
    type,
    name: '',
    code: '',
    description: '',
    image_url: '',
    values_text: '',
    sort_order: 0,
    is_active: true,
    seo_title: '',
    seo_description: '',
    color: '#2563eb',
    icon: '',
    contact_name: '',
    phone: '',
    email: '',
    xml_url: '',
    discount_rate: '',
    default_profit_rate: '',
    rate: '',
    vat_rate: '',
    unit: '',
    dimensional_weight: '',
    weight: '',
  };
}

function rowToForm(row) {
  return {
    ...initialForm(row.type),
    ...row,
    parent_id: row.parent_id || '',
    values_text: (row.values || []).join(', '),
    seo_title: row.settings?.seo_title || '',
    seo_description: row.settings?.seo_description || '',
    color: row.settings?.color || '#2563eb',
    icon: row.settings?.icon || '',
    contact_name: row.settings?.contact_name || '',
    phone: row.settings?.phone || '',
    email: row.settings?.email || '',
    xml_url: row.settings?.xml_url || '',
    discount_rate: row.settings?.discount_rate || '',
    default_profit_rate: row.settings?.default_profit_rate || '',
    rate: row.settings?.rate || row.code || '',
    vat_rate: row.settings?.vat_rate || '',
    unit: row.settings?.unit || '',
    dimensional_weight: row.settings?.dimensional_weight || '',
    weight: row.settings?.weight || '',
  };
}

export function CatalogResourcePage({ type }) {
  const config = configs[type];
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(initialForm(type));
  const [editingId, setEditingId] = useState(null);

  const load = async () => {
    await run(async () => {
      const [companyResponse, resourceResponse] = await Promise.all([
        api.companies.list(),
        api.catalogResources.list({ type }),
      ]);
      setCompanies(companyResponse.data || []);
      setRows(resourceResponse.data || []);
      setForm((current) => ({ ...current, company_id: current.company_id || companyResponse.data?.[0]?.id || '' }));
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    setForm(initialForm(type));
    setEditingId(null);
    load();
  }, [type]);

  const categoryRows = useMemo(() => rows.filter((row) => row.type === 'categories'), [rows]);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      company_id: form.company_id,
      parent_id: form.parent_id || null,
      type,
      name: form.name,
      code: form.code || form.rate || form.unit || null,
      description: form.description,
      image_url: form.image_url || null,
      values: form.values_text ? form.values_text.split(',').map((value) => value.trim()).filter(Boolean) : null,
      sort_order: Number(form.sort_order || 0),
      is_active: Boolean(form.is_active),
      settings: {
        seo_title: form.seo_title,
        seo_description: form.seo_description,
        color: form.color,
        icon: form.icon,
        contact_name: form.contact_name,
        phone: form.phone,
        email: form.email,
        xml_url: form.xml_url,
        discount_rate: form.discount_rate,
        default_profit_rate: form.default_profit_rate,
        rate: form.rate,
        vat_rate: form.vat_rate,
        unit: form.unit,
        dimensional_weight: form.dimensional_weight,
        weight: form.weight,
      },
    };

    await run(async () => {
      if (editingId) {
        await api.catalogResources.update(editingId, payload);
      } else {
        await api.catalogResources.create(payload);
      }
      notify('success', editingId ? 'Kayit guncellendi.' : 'Kayit eklendi.');
      setEditingId(null);
      setForm(initialForm(type));
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const remove = async (row) => {
    await run(async () => {
      await api.catalogResources.remove(row.id);
      notify('success', 'Kayit silindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const renderField = (field) => {
    if (field === 'parent_id') {
      return (
        <select value={form.parent_id} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}>
          <option value="">Ust kategori yok</option>
          {categoryRows.filter((row) => row.id !== editingId).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </select>
      );
    }
    if (field === 'values') {
      return <textarea value={form.values_text} onChange={(event) => setForm({ ...form, values_text: event.target.value })} placeholder="Siyah, Beyaz, Mavi" />;
    }
    if (field === 'is_active') {
      return <label className="check-row"><input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} /> Aktif</label>;
    }
    if (field === 'description' || field === 'seo_description') {
      return <textarea value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />;
    }
    if (field === 'color') {
      return <input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />;
    }
    const numeric = ['sort_order', 'discount_rate', 'default_profit_rate', 'rate', 'vat_rate', 'dimensional_weight', 'weight'].includes(field);
    return <input type={numeric ? 'number' : 'text'} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />;
  };

  return (
    <>
      <PageHeader title={config.title} description={config.description} />
      <section className="catalog-admin-layout">
        <form className="panel compact-panel" onSubmit={submit}>
          <h2>{editingId ? 'Duzenle' : 'Yeni Ekle'}</h2>
          <Field label="Firma">
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          {config.fields.map((field) => <Field label={fieldLabel(field)} key={field}>{renderField(field)}</Field>)}
          <button disabled={loading}><Save size={16} /> Kaydet</button>
        </form>
        {type === 'categories' && (
          <section className="panel compact-panel">
            <h2>Kategori Agaci</h2>
            {rows.filter((row) => !row.parent_id).length === 0 ? <div className="soft-empty">Kategori agaci henuz bos.</div> : rows.filter((row) => !row.parent_id).map((row) => (
              <div className="category-tree-row" key={row.id}>
                <strong>{row.name}</strong>
                {rows.filter((child) => child.parent_id === row.id).map((child) => <span key={child.id}>{child.name}</span>)}
              </div>
            ))}
          </section>
        )}
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <section className="panel">
          <h2>Kayitlar</h2>
          <DataTable
            rows={rows}
            emptyTitle="Kayit yok"
            emptyText={config.empty}
            columns={[
              { key: 'name', label: 'Ad' },
              { key: 'parent', label: 'Ust', render: (row) => row.parent?.name || '-' },
              { key: 'values', label: 'Degerler', render: (row) => Array.isArray(row.values) ? row.values.join(', ') : '-' },
              { key: 'product_count', label: 'Urun Sayisi' },
              { key: 'is_active', label: 'Durum', render: (row) => row.is_active ? 'Aktif' : 'Pasif' },
              { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" className="secondary-button" onClick={() => { setEditingId(row.id); setForm(rowToForm(row)); }}><Edit3 size={15} /> Duzenle</button><button type="button" className="secondary-button" onClick={() => remove(row)}><Trash2 size={15} /> Sil</button></div> },
            ]}
          />
        </section>
      )}
    </>
  );
}

function fieldLabel(field) {
  return {
    parent_id: 'Ust Kategori',
    name: 'Ad',
    sort_order: 'Siralama',
    image_url: 'Gorsel / Logo URL',
    description: 'Aciklama',
    seo_title: 'SEO Baslik',
    seo_description: 'SEO Aciklama',
    is_active: 'Durum',
    values: 'Degerler',
    color: 'Renk',
    icon: 'Ikon',
    contact_name: 'Yetkili',
    phone: 'Telefon',
    email: 'E-posta',
    xml_url: 'XML URL',
    discount_rate: 'Iskonto Orani',
    default_profit_rate: 'Varsayilan Kar Orani',
    rate: 'KDV Orani',
    code: 'Kod',
    vat_rate: 'Varsayilan KDV',
    unit: 'Varsayilan Birim',
    dimensional_weight: 'Varsayilan Desi',
    weight: 'Varsayilan Agirlik',
  }[field] || field;
}
