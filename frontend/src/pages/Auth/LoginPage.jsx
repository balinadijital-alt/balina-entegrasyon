import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, jsonBody } from '../../api/client.js';
import { Field } from '../../components/Field.jsx';

export function LoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@balina.local', password: 'password' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const response = await api('/auth/login', { method: 'POST', body: jsonBody(form) });
      localStorage.setItem('token', response.token);
      navigate('/');
    } catch (exception) {
      setError(exception.message);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Balina Entegrasyon</h1>
        <p>Admin paneline giris yapin.</p>
        {error && <div className="alert">{error}</div>}
        <Field label="E-posta">
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="Sifre">
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </Field>
        <button>Giris Yap</button>
        <Link to="/register">Yeni hesap olustur</Link>
      </form>
    </div>
  );
}
