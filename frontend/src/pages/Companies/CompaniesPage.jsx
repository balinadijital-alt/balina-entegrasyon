import { useEffect, useMemo, useState } from 'react';
import { Building2, CheckCircle2, Plus, Search, ShieldCheck, SlidersHorizontal, Users } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, validateCompany } from '../../utils/validation.js';

const initialForm = { name: '', tax_number: '', email: '', phone: '', address: '', is_active: true, admin_username: '', admin_password: '' };

export function CompaniesPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = async () => {
    await run(async () => {
      const response = await api.companies.list();
      setCompanies(response.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = validateCompany(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      await api.companies.create(form);
      setForm(initialForm);
      notify('success', 'Firma kaydedildi.');
      await load();
    });
  };

  const filteredCompanies = useMemo(() => companies.filter((company) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [company.name, company.tax_number, company.email, company.phone].some((value) => String(value || '').toLowerCase().includes(query));
    const matchesStatus = !statusFilter
      || (statusFilter === 'active' ? company.is_active !== false : company.is_active === false);
    return matchesSearch && matchesStatus;
  }), [companies, search, statusFilter]);

  const activeCount = companies.filter((company) => company.is_active !== false).length;
  const passiveCount = Math.max(0, companies.length - activeCount);

  return (
    <>
      <PageHeader title="Firma Yonetimi" />
      <ReferenceModuleNav section="admin" />

      <section className="admin-reference-hero">
        <div>
          <span>Super yonetici alani</span>
          <h2>Firma kartlarini ve ilk yonetici bilgilerini tek yerden yonetin.</h2>
          <p>Yeni firma acarken zorunlu giris bilgilerini sag panelden tanimlayin, mevcut firmalari listeden takip edin.</p>
        </div>
        <button type="button" onClick={() => document.getElementById('company-create-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
          <Plus size={18} /> Firma Ekle
        </button>
      </section>

      <section className="admin-reference-summary">
        <div><Building2 size={20} /><span>Toplam firma</span><strong>{companies.length}</strong><small>Sistemde kayitli firma</small></div>
        <div><CheckCircle2 size={20} /><span>Aktif firma</span><strong>{activeCount}</strong><small>Kullanima acik firmalar</small></div>
        <div><ShieldCheck size={20} /><span>Pasif firma</span><strong>{passiveCount}</strong><small>Gecici kapali hesaplar</small></div>
        <div><Users size={20} /><span>Gorunen liste</span><strong>{filteredCompanies.length}</strong><small>Arama ve filtre sonucu</small></div>
      </section>

      <section className="admin-reference-filter">
        <div className="admin-reference-filter-title">
          <div>
            <span><SlidersHorizontal size={16} /> Filtreleme</span>
            <strong>Firmalari bulun</strong>
          </div>
          <small>Firma adi, vergi no, e-posta ya da telefon bilgisine gore arayin.</small>
        </div>
        <div className="admin-reference-filter-grid">
          <label className="admin-reference-search">
            <span>Arama</span>
            <div><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Firma, vergi no veya e-posta ara" /></div>
          </label>
          <label>
            <span>Durum</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">Tum firmalar</option>
              <option value="active">Aktif</option>
              <option value="passive">Pasif</option>
            </select>
          </label>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      <section className="admin-reference-layout">
        <div className="admin-reference-table">
          {loading && companies.length === 0 ? <LoadingState /> : (
          <DataTable
            rows={filteredCompanies}
            emptyTitle="Firma bulunamadi"
            emptyText="Filtreleri temizleyin veya sag panelden yeni firma olusturun."
            columns={[
              { key: 'name', label: 'Firma' },
              { key: 'tax_number', label: 'Vergi No' },
              { key: 'email', label: 'E-posta' },
              { key: 'is_active', label: 'Durum', render: (row) => <span className={`admin-status ${row.is_active !== false ? 'active' : 'passive'}`}>{row.is_active !== false ? 'Aktif' : 'Pasif'}</span> },
            ]}
          />
          )}
        </div>
        <aside className="admin-reference-form" id="company-create-form">
          <div className="admin-reference-form-title">
            <div>
              <span><Plus size={16} /> Yeni firma</span>
              <strong>Firma Ekle</strong>
            </div>
            <small>Firma karti ve ilk yonetici girisi bu alandan olusturulur.</small>
          </div>
          <form className="form-grid" onSubmit={submit}>
            <Field label="Firma Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="Vergi No"><input value={form.tax_number} onChange={(event) => setForm({ ...form, tax_number: event.target.value })} /></Field>
            <Field label="E-posta" error={errors.email}><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
            <Field label="Telefon"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="Yonetici kullanici adi" error={errors.admin_username}><input value={form.admin_username} onChange={(event) => setForm({ ...form, admin_username: event.target.value })} /></Field>
            <Field label="Yonetici sifresi" error={errors.admin_password}><input type="password" value={form.admin_password} onChange={(event) => setForm({ ...form, admin_password: event.target.value })} /></Field>
            <Field label="Adres"><textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
            <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Firma Ekle'}</button>
          </form>
        </aside>
      </section>
    </>
  );
}
