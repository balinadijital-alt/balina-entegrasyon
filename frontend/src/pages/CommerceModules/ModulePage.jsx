import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Plus, Save, Search, SlidersHorizontal } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const fieldLabels = {
  title: 'Baslik',
  name: 'Ad',
  slug: 'Adres Kodu',
  status: 'Durum',
  content: 'Icerik',
  body: 'Mesaj Metni',
  excerpt: 'Kisa Ozet',
  code: 'Kod',
  type: 'Tip',
  value: 'Deger',
  provider: 'Saglayici',
  channel: 'Kanal',
  subject: 'Konu',
  placement: 'Konum',
  trigger: 'Tetikleyici',
  location: 'Konum',
  category: 'Kategori',
  settings: 'Ayarlar',
  rules: 'Kurallar',
  items: 'Kalemler',
  values: 'Degerler',
  options: 'Secenekler',
  costs: 'Maliyetler',
  filters: 'Filtreler',
  payload: 'Islem Detayi',
  variables: 'Degiskenler',
  meta_title: 'Meta Baslik',
  meta_description: 'Meta Aciklama',
  discount_rate: 'Indirim Orani',
  rule_type: 'Kural Tipi',
  dealer_group_id: 'Bayi Grubu',
  customer_email: 'Musteri E-posta',
  customer_phone: 'Musteri Telefon',
  cart_total: 'Sepet Tutari',
  minimum_cart_amount: 'Minimum Sepet Tutari',
  operation_type: 'Islem Tipi',
  scope: 'Kapsam',
  scope_value: 'Kapsam Degeri',
  profit_rate: 'Kar Orani',
  minimum_profit_amount: 'Minimum Kar',
  product_id: 'Urun',
  related_product_id: 'Iliskili Urun',
  field_type: 'Alan Tipi',
  prefix: 'On Ek',
  rating: 'Puan',
  comment: 'Yorum',
  moderation_note: 'Moderasyon Notu',
  base_cost: 'Alis Maliyeti',
  commission_cost: 'Komisyon',
  tax_cost: 'Vergi',
  shipping_cost: 'Kargo Maliyeti',
  packaging_cost: 'Paketleme Maliyeti',
  ad_cost: 'Reklam Maliyeti',
  sale_price: 'Satis Fiyati',
  profit_amount: 'Kar Tutari',
  from_status: 'Onceki Durum',
  to_status: 'Sonraki Durum',
  note: 'Not',
  event: 'Olay',
  email: 'E-posta',
  phone: 'Telefon',
  balance: 'Bakiye',
  xml_settings: 'XML Ayarlari',
  dealer_id: 'Bayi',
  order_id: 'Siparis',
  amount: 'Tutar',
  description: 'Aciklama',
  target_currency: 'Hedef Para Birimi',
  base_currency: 'Baz Para Birimi',
  rate: 'Kur / Oran',
  url: 'URL',
  directive: 'Kural',
  parent_code: 'Ust Kod',
  is_default: 'Varsayilan',
  is_active: 'Aktif',
  is_required: 'Zorunlu',
  free_shipping: 'Ucretsiz Kargo',
  created_at: 'Olusturulma Tarihi',
  updated_at: 'Guncellenme Tarihi',
};

const statusLabels = {
  draft: 'Taslak',
  active: 'Aktif',
  passive: 'Pasif',
  pending: 'Bekliyor',
  approved: 'Onayli',
  rejected: 'Reddedildi',
  published: 'Yayinda',
};

const groupSummaries = {
  CMS: {
    eyebrow: 'Tasarim ve icerik',
    description: 'Sayfa, blog, banner ve popup iceriklerini tek yerden yayinlayin.',
    steps: ['Icerigi hazirla', 'Durumu sec', 'Onizle', 'Yayinla'],
  },
  Pazarlama: {
    eyebrow: 'Kampanya ve hedefleme',
    description: 'Kupon, terk edilmis sepet, mesaj sablonu ve feed ayarlarini takip edin.',
    steps: ['Kampanyayi tanimla', 'Kosullari sec', 'Hedef kanali bagla', 'Yayina al'],
  },
  'Gelistirilmis Urun': {
    eyebrow: 'Katalog operasyonu',
    description: 'Varyant, iliski, ozel alan ve yorum kayitlarini katalog akisiyle yonetin.',
    steps: ['Kaydi sec', 'Alanlari doldur', 'Kontrol et', 'Kaydet'],
  },
  'Fiyat Motoru': {
    eyebrow: 'Fiyat ve kar',
    description: 'Kar, maliyet ve toplu fiyat kurallarini pazar yeri hazirligina uygun tutun.',
    steps: ['Kapsami sec', 'Orani gir', 'Maliyeti kontrol et', 'Uygula'],
  },
  'Siparis Is Akisi': {
    eyebrow: 'Operasyon otomasyonu',
    description: 'Siparis durum gecisleri, notlar ve operasyon gecmisini izlenebilir hale getirin.',
    steps: ['Tetikleyici sec', 'Durumu belirle', 'Not ekle', 'Takip et'],
  },
  'Bayi B2B': {
    eyebrow: 'Bayi yonetimi',
    description: 'Bayi kartlari, fiyatlari ve tahsilatlarini daha okunur bir akisla yonetin.',
    steps: ['Bayi sec', 'Fiyat/tahsilat gir', 'Limiti kontrol et', 'Kaydet'],
  },
  'SEO ve Ayarlar': {
    eyebrow: 'SEO ve teknik ayar',
    description: 'Meta, sitemap, robots, dil, lokasyon ve doviz ayarlarini net sekilde yonetin.',
    steps: ['Kapsami sec', 'Icerigi gir', 'Durumu kontrol et', 'Yayina al'],
  },
};

function fieldLabel(field) {
  return fieldLabels[field] || field.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'Evet' : 'Hayir';
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-';
  if (typeof value === 'object') return Object.keys(value).length > 0 ? 'Detay var' : '-';
  return String(value);
}

function emptyForm(config) {
  return config.fields.reduce((carry, field) => ({ ...carry, [field]: config.defaults?.[field] ?? '' }), {});
}

function moduleSummary(config) {
  return groupSummaries[config.group] || {
    eyebrow: 'Modul yonetimi',
    description: `${config.title} kayitlarini arayin, filtreleyin ve yeni kayitlari kontrollu bicimde olusturun.`,
    steps: ['Ara', 'Filtrele', 'Duzenle', 'Kaydet'],
  };
}

function normalizeValue(field, value) {
  if (['settings', 'rules', 'items', 'values', 'options', 'costs', 'filters', 'payload', 'xml_settings', 'variables'].includes(field)) {
    if (!value) return null;
    try {
      return typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      throw new Error(`${fieldLabel(field)} alaninda gecerli JSON girin.`);
    }
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

  const activeRows = useMemo(() => rows.filter((row) => row.status === 'active' || row.is_active === true).length, [rows]);
  const pendingRows = useMemo(() => rows.filter((row) => ['draft', 'pending'].includes(row.status)).length, [rows]);
  const summary = moduleSummary(config);

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
      return <textarea value={value} onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder={field.includes('settings') || field.includes('rules') ? '{"anahtar":"deger"}' : `${fieldLabel(field)} girin`} />;
    }

    if (['status', 'type', 'channel', 'provider', 'scope', 'placement'].includes(field)) {
      return <input value={value} onChange={(event) => setForm({ ...form, [field]: event.target.value })} placeholder={fieldLabel(field)} />;
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
      <ReferenceModuleNav section="commerce" />

      <section className="commerce-reference-hero">
        <div>
          <span>{summary.eyebrow}</span>
          <h2>{config.title}</h2>
          <p>{summary.description}</p>
        </div>
        <button type="button" onClick={() => document.getElementById('module-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Plus size={18} /> Yeni Kayit
        </button>
      </section>

      <section className="commerce-reference-flow">
        {summary.steps.map((step, index) => (
          <div key={step} className={index === 0 ? 'active' : ''}>
            <em>{index + 1}</em>
            <strong>{step}</strong>
            <span>{index === 0 ? 'Devam ediyor' : 'Siradaki adim'}</span>
          </div>
        ))}
      </section>

      <section className="commerce-reference-summary">
        <div>
          <span>Toplam kayit</span>
          <strong>{rows.length}</strong>
          <small>Bu moduldeki tum kayitlar</small>
        </div>
        <div>
          <span>Aktif</span>
          <strong>{activeRows}</strong>
          <small>Yayinda veya kullanima acik</small>
        </div>
        <div>
          <span>Bekleyen</span>
          <strong>{pendingRows}</strong>
          <small>Taslak ya da onay bekliyor</small>
        </div>
        <div>
          <span>Gorunen liste</span>
          <strong>{filteredRows.length}</strong>
          <small>Arama ve filtre sonucu</small>
        </div>
      </section>

      <section className="commerce-reference-filter">
        <div className="commerce-reference-filter-title">
          <div>
            <span><SlidersHorizontal size={16} /> Filtreleme</span>
            <strong>{config.title} kayitlarini bulun</strong>
          </div>
          <small>Referans paneldeki gibi once arayin, sonra gerekirse yeni kayit ekleyin.</small>
        </div>
        <div className="commerce-reference-filter-grid">
          <label className="commerce-reference-search">
            <span>Arama</span>
            <div>
              <Search size={17} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`${config.title} ara`} />
            </div>
          </label>
          <label>
            <span>Durum</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Tum durumlar</option>
              <option value="draft">Taslak</option>
              <option value="active">Aktif</option>
              <option value="pending">Bekliyor</option>
              <option value="approved">Onayli</option>
              <option value="rejected">Reddedildi</option>
            </select>
          </label>
          <label>
            <span>Modul grubu</span>
            <input value={config.group || 'Genel'} readOnly />
          </label>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      <section className="commerce-reference-layout">
        <div className="commerce-reference-table">
          {loading && rows.length === 0 ? <LoadingState /> : (
            <DataTable
              rows={filteredRows}
              emptyTitle="Kayit bulunamadi"
              emptyText={`${config.title} icin henuz kayit yok. Yeni kayit ekleyebilir veya filtreleri temizleyebilirsiniz.`}
              columns={[
                { key: config.primary, label: fieldLabel(config.primary), render: (row) => formatValue(row[config.primary] ?? row.title ?? row.name) },
                { key: config.secondary, label: fieldLabel(config.secondary), render: (row) => formatValue(row[config.secondary]) },
                { key: 'status', label: 'Durum', render: (row) => row.status ? <span className={`badge ${row.status}`}>{statusLabels[row.status] || row.status}</span> : (row.is_active === false ? 'Pasif' : 'Aktif') },
                { key: 'created_at', label: fieldLabel('created_at'), render: (row) => row.created_at ? new Date(row.created_at).toLocaleDateString('tr-TR') : '-' },
              ]}
            />
          )}
        </div>

        <aside className="commerce-reference-form" id="module-create-form">
          <div className="commerce-reference-form-title">
            <div>
              <span><CheckCircle2 size={16} /> Yeni Kayit</span>
              <strong>{config.title}</strong>
            </div>
            <small>Gerekli alanlari doldurun ve kaydedin.</small>
          </div>
          <form className="form-grid" onSubmit={submit}>
            {config.fields.map((field) => (
              <Field label={fieldLabel(field)} key={field}>{renderField(field)}</Field>
            ))}
            <button disabled={loading}><Save size={16} /> Kaydet</button>
          </form>
        </aside>
      </section>
    </>
  );
}
