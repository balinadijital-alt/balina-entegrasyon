import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, ShieldCheck, Store, Workflow } from 'lucide-react';
import { defaultRouteForUser } from '../../auth/permissions.js';
import { Field } from '../../components/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, required } from '../../utils/validation.js';

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [form, setForm] = useState({ email: 'balinaadmin', password: '' });
  const [errors, setErrors] = useState({});

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = {};
    if (!required(form.email)) validationErrors.email = 'Kullanici adi zorunludur.';
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
      <section className="auth-shell">
        <aside className="auth-story">
          <div className="auth-brand-mark"><KeyRound size={24} /></div>
          <span>Balina Entegrasyon</span>
          <h1>Pazaryeri, urun, siparis ve operasyon akislarini tek panelden yonetin.</h1>
          <p>Magaza baglama, urun hazirligi, toplu gonderim ve hata takibi ayni is akisi icinde okunur hale getirildi.</p>
          <div className="auth-story-grid">
            <div><Store size={18} /><strong>Magaza</strong><small>Trendyol ve Hepsiburada</small></div>
            <div><Workflow size={18} /><strong>Akis</strong><small>Eslestirme ve gonderim</small></div>
            <div><ShieldCheck size={18} /><strong>Kontrol</strong><small>Yetki ve firma izolasyonu</small></div>
          </div>
        </aside>

        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-heading">
            <span><CheckCircle2 size={16} /> Guvenli giris</span>
            <h2>Panele giris yapin</h2>
            <p>Firma operasyonlarina devam etmek icin kullanici bilgilerinizi girin.</p>
          </div>
          {error && <div className="alert">{error}</div>}
          <Field label="Kullanici adi" error={errors.email}>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Sifre" error={errors.password}>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          <button disabled={loading}>{loading ? 'Giris yapiliyor...' : 'Giris Yap'}</button>
          <Link to="/register">Yeni hesap olustur</Link>
        </form>
      </section>
    </div>
  );
}
