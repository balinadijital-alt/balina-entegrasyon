import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { defaultRouteForUser } from '../../auth/permissions.js';
import { Field } from '../../components/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, required } from '../../utils/validation.js';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [form, setForm] = useState({ email: 'admin@balina.local', password: 'password' });
  const [errors, setErrors] = useState({});

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = {};
    if (!required(form.email)) validationErrors.email = 'E-posta zorunludur.';
    if (!required(form.password)) validationErrors.password = 'Sifre zorunludur.';
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      const response = await login(form);
      navigate(response.panel || defaultRouteForUser(response.user, '/app'));
    });
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <h1>Balina Entegrasyon</h1>
        <p>Admin paneline giris yapin.</p>
        {error && <div className="alert">{error}</div>}
        <Field label="E-posta" error={errors.email}>
          <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label="Sifre" error={errors.password}>
          <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
        </Field>
        <button disabled={loading}>{loading ? 'Giris yapiliyor...' : 'Giris Yap'}</button>
        <Link to="/register">Yeni hesap olustur</Link>
      </form>
    </div>
  );
}
