import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, required, validateProduct } from '../../utils/validation.js';

const steps = [
  'Urun Bilgileri',
  'Kategori/Marka',
  'Fiyat Stok',
  'Varyantlar',
  'Gorseller',
  'Aciklama/SEO',
  'Pazaryeri Hazirligi',
  'Onizleme',
];

const stepDescriptions = [
  'Urunun temel satis bilgisini ve hangi firmaya ait oldugunu belirleyin.',
  'Kategori, marka, barkod ve SKU bilgileri pazaryeri eslestirme icin kullanilir.',
  'Fiyat, stok, KDV ve desi bilgileri satis ve kargo hesaplamalarini etkiler.',
  'Varyantli urunlerde renk, beden ve her varyant icin stok/fiyat bilgilerini girin.',
  'Pazaryerleri icin zorunlu olan ana gorsel, galeri ve video alanlarini tamamlayin.',
  'Urun aciklamasi pazaryerinde musteriye gorunecek metindir.',
  'Pazaryeri kategori ve ozellikleri urunun gonderime hazir olmasi icin kontrol edilir.',
  'Kaydetmeden once eksik alanlari ve pazaryeri hazirlik durumunu kontrol edin.',
];

const readinessLabels = {
  temel: 'Temel bilgiler',
  katalog: 'Katalog bilgileri',
  barkod: 'Barkod',
  fiyatStok: 'Fiyat ve stok',
  gorsel: 'Gorsel',
  aciklama: 'Aciklama',
  seo: 'SEO bilgileri',
  trendyol: 'Trendyol bilgileri',
  hepsiburada: 'Hepsiburada bilgileri',
};

const missingLabels = {
  category_mapping: 'Kategori eslesmesi',
  marketplace_category: 'Pazaryeri kategorisi',
  required_attributes: 'Zorunlu ozellik',
  attributes: 'Katalog niteligi',
  brand: 'Marka',
  category: 'Kategori',
  vat_rate: 'KDV',
  seo: 'SEO bilgileri',
  cargo: 'Kargo bilgisi',
  image: 'Gorsel',
  price: 'Fiyat',
  stock: 'Stok',
  barcode: 'Barkod',
  sku: 'SKU',
  description: 'Aciklama',
};

function missingText(fields = []) {
  return fields.map((field) => missingLabels[field] || field).join(', ');
}

const initialForm = {
  company_id: '',
  name: '',
  brand: '',
  category: '',
  supplier_name: '',
  barcode: '',
  sku: '',
  product_type: 'standard',
  short_description: '',
  description: '',
  seo_title: '',
  seo_description: '',
  purchase_price: '',
  price: '',
  list_price: '',
  vat_rate: 20,
  unit: 'adet',
  stock: 0,
  critical_stock: 0,
  dimensional_weight: 1,
  weight: '',
  shipping_type: 'standard',
  main_image_url: '',
  gallery_images: '',
  video_url: '',
  variant_group: '',
  variant_options: '',
  trendyol_category_id: '',
  hepsiburada_category_id: '',
  trendyol_attributes: '',
  hepsiburada_attributes: '',
  tags: [],
  attributes: {},
  status: 'draft',
};

function parseJson(value, fallback) {
  return value ? JSON.parse(value) : fallback;
}

function parseList(value) {
  return value.split('\n').map((item) => item.trim()).filter(Boolean);
}

function stringifyJson(value) {
  if (!value) return '';
  return JSON.stringify(value, null, 2);
}

function productToForm(product) {
  return {
    ...initialForm,
    ...product,
    company_id: product.company_id || '',
    purchase_price: product.purchase_price ?? '',
    price: product.price ?? '',
    list_price: product.list_price ?? '',
    stock: product.stock ?? 0,
    critical_stock: product.critical_stock ?? 0,
    dimensional_weight: product.dimensional_weight ?? 1,
    weight: product.weight ?? '',
    trendyol_category_id: product.trendyol_category_id ?? '',
    hepsiburada_category_id: product.hepsiburada_category_id ?? '',
    gallery_images: Array.isArray(product.gallery_images) ? product.gallery_images.join('\n') : '',
    variant_options: stringifyJson(product.variant_options),
    trendyol_attributes: stringifyJson(product.trendyol_attributes),
    hepsiburada_attributes: stringifyJson(product.hepsiburada_attributes),
    tags: product.tags || [],
    attributes: product.attributes || {},
  };
}

function valuesOf(resource) {
  return Array.isArray(resource.values) ? resource.values : [];
}

export function ProductCreatePage() {
  const { id } = useParams();
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [catalog, setCatalog] = useState({
    categories: [],
    brands: [],
    attributes: [],
    tags: [],
    suppliers: [],
    taxRates: [],
    units: [],
    defaults: [],
  });
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [step, setStep] = useState(0);
  const [readinessReport, setReadinessReport] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const isEdit = Boolean(id);

  const readiness = useMemo(() => {
    const checks = {
      temel: required(form.name) && required(form.sku) && required(form.company_id),
      katalog: required(form.category) && required(form.brand) && Object.keys(form.attributes || {}).length > 0,
      barkod: required(form.barcode),
      fiyatStok: Number(form.price) > 0 && Number(form.stock) >= 0,
      gorsel: required(form.main_image_url) || parseList(form.gallery_images).length > 0,
      aciklama: required(form.description) || required(form.short_description),
      seo: required(form.seo_title) && required(form.seo_description),
      trendyol: required(form.trendyol_category_id) && required(form.trendyol_attributes),
      hepsiburada: required(form.hepsiburada_category_id) && required(form.hepsiburada_attributes),
    };
    return checks;
  }, [form]);

  const setValue = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const load = async () => {
    await run(async () => {
      const safeList = async (params) => {
        try {
          return await api.catalogResources.list(params);
        } catch {
          return { data: [] };
        }
      };

      const [companyResponse, productResponse, categories, brands, attributes, tags, suppliers, taxRates, units, defaults] = await Promise.all([
        api.companies.list(),
        isEdit ? api.products.show(id) : Promise.resolve(null),
        safeList({ type: 'categories', active: 1 }),
        safeList({ type: 'brands', active: 1 }),
        safeList({ type: 'attributes', active: 1 }),
        safeList({ type: 'tags', active: 1 }),
        safeList({ type: 'suppliers', active: 1 }),
        safeList({ type: 'tax-rates', active: 1 }),
        safeList({ type: 'units', active: 1 }),
        safeList({ type: 'defaults', active: 1 }),
      ]);
      setCompanies(companyResponse.data || []);
      setForm((current) => ({ ...current, company_id: current.company_id || companyResponse.data?.[0]?.id || '' }));
      setCatalog({
        categories: categories.data || [],
        brands: brands.data || [],
        attributes: attributes.data || [],
        tags: tags.data || [],
        suppliers: suppliers.data || [],
        taxRates: taxRates.data || [],
        units: units.data || [],
        defaults: defaults.data || [],
      });
      if (productResponse) {
        setForm(productToForm(productResponse));
        setReadinessReport(productResponse.marketplace_readiness || null);
      }
    });
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = validateProduct(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      const payload = {
        ...form,
        product_type: form.product_type,
        purchase_price: form.purchase_price === '' ? null : Number(form.purchase_price),
        price: Number(form.price),
        list_price: form.list_price === '' ? null : Number(form.list_price),
        stock: Number(form.stock),
        critical_stock: Number(form.critical_stock || 0),
        vat_rate: Number(form.vat_rate),
        unit: form.unit || null,
        dimensional_weight: Number(form.dimensional_weight || 1),
        weight: form.weight === '' ? null : Number(form.weight),
        trendyol_category_id: form.trendyol_category_id === '' ? null : Number(form.trendyol_category_id),
        gallery_images: parseList(form.gallery_images),
        variant_options: parseJson(form.variant_options, null),
        trendyol_attributes: parseJson(form.trendyol_attributes, null),
        hepsiburada_attributes: parseJson(form.hepsiburada_attributes, null),
        tags: form.tags || [],
        attributes: form.attributes || {},
      };
      const saved = isEdit ? await api.products.update(id, payload) : await api.products.create(payload);
      const readinessResponse = await api.products.readiness(saved.id);
      setReadinessReport(readinessResponse.marketplaces || readinessResponse);
      if (!isEdit) {
        setForm(initialForm);
        setStep(0);
      }
      notify('success', isEdit ? 'Urun guncellendi ve hazirlik kontrolu yenilendi.' : 'Urun kaydedildi.');
    }, { onError: (message) => notify('error', message) });
  };

  const validateJsonField = (key, label) => {
    try {
      parseJson(form[key], null);
      setErrors((current) => ({ ...current, [key]: undefined }));
    } catch {
      setErrors((current) => ({ ...current, [key]: `${label} gecerli formatta olmali.` }));
    }
  };

  const toggleTag = (tagName) => {
    setForm((current) => {
      const tags = current.tags || [];
      return { ...current, tags: tags.includes(tagName) ? tags.filter((tag) => tag !== tagName) : [...tags, tagName] };
    });
  };

  const setAttribute = (name, value) => {
    setForm((current) => {
      const next = { ...(current.attributes || {}) };
      if (value) next[name] = value;
      else delete next[name];
      return { ...current, attributes: next };
    });
  };

  const uploadImage = async () => {
    if (!isEdit) {
      notify('error', 'Gorsel yuklemek icin once urunu kaydedin.');
      return;
    }
    if (!imageFile) {
      notify('error', 'Yuklemek icin gorsel seciniz.');
      return;
    }
    const body = new FormData();
    body.append('image', imageFile);
    await run(async () => {
      await api.products.uploadImage(id, body);
      setImageFile(null);
      notify('success', 'Urun gorseli yuklendi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title={isEdit ? 'Urun Duzenleme Sihirbazi' : 'Urun Ekleme Sihirbazi'} />
      <ReferenceModuleNav section="products" />
      {isEdit && (
        <section className="state-box workflow-warning">
          <span>Duzenleme modu: Kaydetmeden once pazaryeri hazirlik kontrolleri tekrar calisir.</span>
          <Link className="button-link secondary-link" to={`/products/${id}`}>Detaya Don</Link>
        </section>
      )}
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && companies.length === 0 ? <LoadingState /> : null}
      <section className="panel wizard-panel product-wizard-panel">
        <div className="wizard-steps">
          {steps.map((label, index) => (
            <button type="button" className={index === step ? 'wizard-step active' : 'wizard-step'} key={label} onClick={() => setStep(index)}>
              <span>{index + 1}</span>
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          <div className="wizard-step-header">
            <span>Adim {step + 1} / {steps.length}</span>
            <h2>{steps[step]}</h2>
            <p>{stepDescriptions[step]}</p>
          </div>
          {step === 0 && (
            <div className="form-grid">
              <Field label="Firma" error={errors.company_id}>
                <select value={form.company_id} onChange={(event) => setValue('company_id', event.target.value)}>
                  <option value="">Seciniz</option>
                  {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </Field>
              <Field label="Urun Adi" error={errors.name}><input value={form.name} onChange={(event) => setValue('name', event.target.value)} /></Field>
              <Field label="Urun Tipi">
                <select value={form.product_type} onChange={(event) => setValue('product_type', event.target.value)}>
                  <option value="standard">Standart</option>
                  <option value="variant">Varyantli</option>
                  <option value="digital">Dijital</option>
                  <option value="square_meter">Metrekare En-Boy</option>
                </select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="form-grid">
              {catalog.categories.length === 0 && <div className="soft-empty">Kategori bulunamadi. <Link to="/catalog/categories">Once kategori olusturun</Link>.</div>}
              {catalog.brands.length === 0 && <div className="soft-empty">Marka bulunamadi. <Link to="/catalog/brands">Once marka olusturun</Link>.</div>}
              <Field label="Kategori">
                <select value={form.category} onChange={(event) => setValue('category', event.target.value)}>
                  <option value="">Kategori seciniz</option>
                  {catalog.categories.map((category) => <option key={category.id} value={category.name}>{category.parent?.name ? `${category.parent.name} / ${category.name}` : category.name}</option>)}
                </select>
              </Field>
              <Field label="Marka">
                <select value={form.brand} onChange={(event) => setValue('brand', event.target.value)}>
                  <option value="">Marka seciniz</option>
                  {catalog.brands.map((brand) => <option key={brand.id} value={brand.name}>{brand.name}</option>)}
                </select>
              </Field>
              <Field label="Tedarikci">
                <select value={form.supplier_name} onChange={(event) => setValue('supplier_name', event.target.value)}>
                  <option value="">Tedarikci seciniz</option>
                  {catalog.suppliers.map((supplier) => <option key={supplier.id} value={supplier.name}>{supplier.name}</option>)}
                </select>
              </Field>
              <Field label="Barkod"><input value={form.barcode} onChange={(event) => setValue('barcode', event.target.value)} /></Field>
              <Field label="SKU" error={errors.sku}><input value={form.sku} onChange={(event) => setValue('sku', event.target.value)} /></Field>
            </div>
          )}

          {step === 2 && (
            <div className="form-grid">
              <Field label="Alis Fiyati"><input type="number" value={form.purchase_price} onChange={(event) => setValue('purchase_price', event.target.value)} /></Field>
              <Field label="Satis Fiyati" error={errors.price}><input type="number" value={form.price} onChange={(event) => setValue('price', event.target.value)} /></Field>
              <Field label="Liste Fiyati"><input type="number" value={form.list_price} onChange={(event) => setValue('list_price', event.target.value)} /></Field>
              <Field label="KDV Orani">
                <select value={form.vat_rate} onChange={(event) => setValue('vat_rate', event.target.value)}>
                  {[...catalog.taxRates, ...catalog.defaults].length === 0 && <option value="20">%20</option>}
                  {catalog.taxRates.map((rate) => <option key={rate.id} value={rate.settings?.rate || rate.code || rate.name}>{rate.name}</option>)}
                  {catalog.defaults.map((item) => item.settings?.vat_rate ? <option key={item.id} value={item.settings.vat_rate}>Varsayilan %{item.settings.vat_rate}</option> : null)}
                </select>
              </Field>
              <Field label="Birim">
                <select value={form.unit} onChange={(event) => setValue('unit', event.target.value)}>
                  <option value="">Birim seciniz</option>
                  {catalog.units.length === 0 && <option value="adet">Adet</option>}
                  {catalog.units.map((unit) => <option key={unit.id} value={unit.code || unit.name}>{unit.name}</option>)}
                </select>
              </Field>
              <Field label="Stok" error={errors.stock}><input type="number" value={form.stock} onChange={(event) => setValue('stock', event.target.value)} /></Field>
              <Field label="Kritik Stok"><input type="number" value={form.critical_stock} onChange={(event) => setValue('critical_stock', event.target.value)} /></Field>
              <Field label="Desi"><input type="number" value={form.dimensional_weight} onChange={(event) => setValue('dimensional_weight', event.target.value)} /></Field>
              <Field label="Agirlik"><input type="number" value={form.weight} onChange={(event) => setValue('weight', event.target.value)} /></Field>
              <Field label="Kargo Tipi"><input value={form.shipping_type} onChange={(event) => setValue('shipping_type', event.target.value)} /></Field>
            </div>
          )}

          {step === 3 && (
            <div className="form-grid">
              <Field label="Varyant Basligi"><input value={form.variant_group} onChange={(event) => setValue('variant_group', event.target.value)} placeholder="Renk, Beden" /></Field>
              <Field label="Varyant Degerleri" error={errors.variant_options}>
                <textarea value={form.variant_options} onBlur={() => validateJsonField('variant_options', 'Varyant degerleri')} onChange={(event) => setValue('variant_options', event.target.value)} placeholder='[{"name":"Siyah","sku":"SKU-S","stock":5,"price":120,"barcode":"123"}]' />
              </Field>
            </div>
          )}

          {step === 4 && (
            <div className="form-grid">
              <Field label="Ana Gorsel URL"><input value={form.main_image_url} onChange={(event) => setValue('main_image_url', event.target.value)} /></Field>
              <Field label="Galeri Gorselleri"><textarea value={form.gallery_images} onChange={(event) => setValue('gallery_images', event.target.value)} placeholder="Her satira bir gorsel URL" /></Field>
              <Field label="Video URL"><input value={form.video_url} onChange={(event) => setValue('video_url', event.target.value)} /></Field>
              <Field label="Bilgisayardan Gorsel Yukle">
                <div className="upload-inline">
                  <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files[0])} />
                  <button type="button" className="secondary-button" disabled={loading || !imageFile} onClick={uploadImage}>Yukle</button>
                </div>
              </Field>
            </div>
          )}

          {step === 5 && (
            <div className="form-grid">
              <Field label="Kisa Aciklama"><textarea value={form.short_description} onChange={(event) => setValue('short_description', event.target.value)} /></Field>
              <Field label="Detayli Aciklama"><textarea value={form.description} onChange={(event) => setValue('description', event.target.value)} /></Field>
              <Field label="SEO Baslik"><input value={form.seo_title} onChange={(event) => setValue('seo_title', event.target.value)} /></Field>
              <Field label="SEO Aciklama"><textarea value={form.seo_description} onChange={(event) => setValue('seo_description', event.target.value)} /></Field>
            </div>
          )}

          {step === 6 && (
            <div className="form-grid">
              <div className="soft-empty">
                Katalog nitelikleri urunun pazaryerine hazirligini guclendirir. Eksikse <Link to="/catalog/attributes">Nitelikler / Ozellikler</Link> sayfasindan ekleyin.
              </div>
              {catalog.attributes.map((attribute) => (
                <Field label={attribute.name} key={attribute.id}>
                  <select value={form.attributes?.[attribute.name] || ''} onChange={(event) => setAttribute(attribute.name, event.target.value)}>
                    <option value="">Deger seciniz</option>
                    {valuesOf(attribute).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
              ))}
              <Field label="Etiketler">
                <div className="tag-selector">
                  {catalog.tags.length === 0 ? <span>Etiket yok. Etiketler sayfasindan ekleyebilirsiniz.</span> : catalog.tags.map((tag) => (
                    <label className="check-row" key={tag.id}>
                      <input type="checkbox" checked={(form.tags || []).includes(tag.name)} onChange={() => toggleTag(tag.name)} />
                      {tag.name}
                    </label>
                  ))}
                </div>
              </Field>
              <Field label="Trendyol Kategori Kodu"><input type="number" value={form.trendyol_category_id} onChange={(event) => setValue('trendyol_category_id', event.target.value)} /></Field>
              <Field label="Hepsiburada Kategori Kodu"><input value={form.hepsiburada_category_id} onChange={(event) => setValue('hepsiburada_category_id', event.target.value)} /></Field>
              <Field label="Trendyol Ozellik Eslesmeleri" error={errors.trendyol_attributes}>
                <textarea value={form.trendyol_attributes} onBlur={() => validateJsonField('trendyol_attributes', 'Trendyol ozellikleri')} onChange={(event) => setValue('trendyol_attributes', event.target.value)} placeholder='[{"attributeId":1,"attributeValueId":1}]' />
              </Field>
              <Field label="Hepsiburada Ozellik Eslesmeleri" error={errors.hepsiburada_attributes}>
                <textarea value={form.hepsiburada_attributes} onBlur={() => validateJsonField('hepsiburada_attributes', 'Hepsiburada ozellikleri')} onChange={(event) => setValue('hepsiburada_attributes', event.target.value)} placeholder='[{"name":"Renk","value":"Siyah"}]' />
              </Field>
              <div className="readiness-grid">
                {Object.entries(readiness).map(([key, passed]) => (
                  <span className={passed ? 'status-pill ready' : 'status-pill blocked'} key={key}>
                    {passed ? 'Tamam' : 'Eksik'} {readinessLabels[key] || key}
                  </span>
                ))}
              </div>
              <div className="workflow-warning readiness-grid">
                {readinessReport && Object.entries(readinessReport).map(([code, report]) => (
                  <div className="soft-empty" key={code}>
                    <strong>{code} · {report.score || 0}%</strong>
                    <span>{report.ready ? 'Hazir' : `Eksik: ${missingText(report.missing_fields || [])}`}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 7 && (
            <div className="preview-grid">
              <div className="soft-empty"><strong>{form.name || 'Urun adi yok'}</strong><span>{form.sku || 'SKU yok'} / {form.barcode || 'Barkod yok'}</span></div>
              <div className="soft-empty"><strong>{form.price || 0} TL</strong><span>Stok {form.stock || 0}, KDV %{form.vat_rate}</span></div>
              <div className="soft-empty"><strong>Pazaryeri Hazirlik</strong><span>{Object.values(readiness).filter(Boolean).length}/{Object.keys(readiness).length} kontrol tamam</span></div>
              <div className="soft-empty"><strong>Durum</strong><span>{form.status === 'draft' ? 'Taslak' : form.status === 'active' ? 'Aktif' : 'Pasif'}</span></div>
            </div>
          )}

          <div className="wizard-actions">
            <button type="button" className="secondary-button" disabled={step === 0} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} /> Geri</button>
            {step < steps.length - 1 ? (
              <button type="button" className="primary-next-button" onClick={() => setStep((current) => current + 1)}>Sonraki <ChevronRight size={16} /></button>
            ) : (
              <button className="primary-save-button" disabled={loading}><Save size={16} /> {loading ? 'Kaydediliyor...' : (isEdit ? 'Kontrol Et ve Guncelle' : 'Onayla ve Kaydet')}</button>
            )}
            <span className="wizard-save-state"><CheckCircle2 size={16} /> Taslak akisi</span>
          </div>
        </form>
      </section>
    </>
  );
}
