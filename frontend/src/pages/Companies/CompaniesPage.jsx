import { useEffect, useState } from 'react';
import { api, jsonBody } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Field } from '../../components/Field.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

const initialForm = { name: '', tax_number: '', email: '', phone: '', address: '', is_active: true };

export function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    const response = await api('/companies');
    setCompanies(response.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    await api('/companies', { method: 'POST', body: jsonBody(form) });
    setForm(initialForm);
    load();
  };

  return (
    <>
      <PageHeader title="Firma Yonetimi" />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Vergi No"><input value={form.tax_number} onChange={(event) => setForm({ ...form, tax_number: event.target.value })} /></Field>
          <Field label="E-posta"><input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          <Field label="Telefon"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
          <Field label="Adres"><textarea value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
          <button>Firma Ekle</button>
        </form>
      </section>
      <DataTable
        rows={companies}
        columns={[
          { key: 'name', label: 'Firma' },
          { key: 'tax_number', label: 'Vergi No' },
          { key: 'email', label: 'E-posta' },
          { key: 'is_active', label: 'Durum', render: (row) => (row.is_active ? 'Aktif' : 'Pasif') },
        ]}
      />
    </>
  );
}
