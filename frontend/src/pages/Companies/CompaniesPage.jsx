import { useEffect, useState } from 'react';
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

  return (
    <>
      <PageHeader title="Firma Yonetimi" />
      <ReferenceModuleNav section="admin" />
      <section className="panel">
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
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && companies.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={companies}
        columns={[
          { key: 'name', label: 'Firma' },
          { key: 'tax_number', label: 'Vergi No' },
          { key: 'email', label: 'E-posta' },
          { key: 'is_active', label: 'Durum', render: (row) => (row.is_active ? 'Aktif' : 'Pasif') },
        ]}
      />
      )}
    </>
  );
}
