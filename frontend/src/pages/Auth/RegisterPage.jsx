import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, KeyRound, ShieldCheck, Store, Workflow } from 'lucide-react';
import { Field } from '../../components/Field.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, required } from '../../utils/validation.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [form, setForm] = useState({ name: '', email: '', password: '', password_confirmation: '' });
  const [errors, setErrors] = useState({});

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = {};
    if (!required(form.name)) validationErrors.name = 'Ad soyad zorunludur.';
    if (!required(form.email)) validationErrors.email = 'E-posta zorunludur.';
    if (form.password.length < 8) validationErrors.password = 'Sifre en az 8 karakter olmalidir.';
    if (form.password !== form.password_confirmation) validationErrors.password_confirmation = 'Sifreler eslesmiyor.';
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      await register(form);
      navigate('/');
    });
  };

  return (
    <div className="auth-page">
      <section className="auth-shell">
        <aside className="auth-story">
          <div className="auth-brand-mark"><KeyRound size={24} /></div>
          <span>Balina Entegrasyon</span>
          <h1>Yeni firma operasyonunu pazaryeri hazirlik akisiyle baslatin.</h1>
          <p>Hesap olusturduktan sonra urun, siparis, entegrasyon ve raporlama modulleri ayni panel deneyimi icinde acilir.</p>
          <div className="auth-story-grid">
            <div><Store size={18} /><strong>Firma</strong><small>Tek merkezden yonetim</small></div>
            <div><Workflow size={18} /><strong>Kurulum</strong><small>Adim adim ilerleme</small></div>
            <div><ShieldCheck size={18} /><strong>Yetki</strong><small>Rol bazli erisim</small></div>
          </div>
        </aside>

        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-heading">
            <span><CheckCircle2 size={16} /> Yeni hesap</span>
            <h2>Hesap olustur</h2>
            <p>Panel kullanimi icin temel kullanici bilgilerini girin.</p>
          </div>
          {error && <div className="alert">{error}</div>}
          <Field label="Ad Soyad" error={errors.name}>
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </Field>
          <Field label="E-posta" error={errors.email}>
            <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Sifre" error={errors.password}>
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          </Field>
          <Field label="Sifre Tekrar" error={errors.password_confirmation}>
            <input type="password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} />
          </Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Kayit Ol'}</button>
          <Link to="/login">Giris ekranina don</Link>
        </form>
      </section>
    </div>
  );
}
