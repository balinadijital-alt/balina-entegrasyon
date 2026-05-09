import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, jsonBody } from '../../api/client.js';
import { Field } from '../../components/Field.jsx';

export function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await api('/auth/register', { method: 'POST', body: jsonBody(form) });
      localStorage.setItem('token', response.token);
      navigate('/');
    } catch (exception) {
      setError(exception.message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Hesap Olustur</h1>
        {error && <div className="alert">{error}</div>}
        <Field label="Ad Soyad">
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        </Field>
        <Field label="E-posta">
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="Sifre">
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </Field>
        <Field label="Sifre Tekrar">
          <input type="password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} />
        </Field>
        <button>Kayit Ol</button>
        <Link to="/login">Giris ekranina don</Link>
      </form>
    </div>
  );
}
