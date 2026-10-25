import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { friendlyError } from '../lib/errors';

type Props = { notify: (message: string, kind?: 'success' | 'error') => void };

export default function Auth({ notify }: Props) {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    if (!email.trim()) return notify('Введите email.', 'error');
    if (mode !== 'reset' && password.length < 6) return notify('Пароль должен содержать не менее 6 символов.', 'error');
    setBusy(true);
    try {
      if (mode === 'signup') {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        notify('Мы отправили письмо с подтверждением вам на почту', 'success');
      } else if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (error) throw error;
        notify('Если аккаунт зарегистрирован, то письмо для восстановления отправлено вам на почту.', 'success');
      }
    } catch (err) {
      notify(friendlyError(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell">
    <section className="auth-card">
      <div className="brand-mark">✳</div>
      <p className="eyebrow">ВАША СЕМЕЙНАЯ ИСТОРИЯ</p>
      <h1>Семейное древо</h1>
      <p className="muted">Собирайте истории поколений в одном месте.</p>
      <div className="tabs">
        <button className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => setMode('login')}>Вход</button>
        <button className={mode === 'signup' ? 'tab active' : 'tab'} onClick={() => setMode('signup')}>Регистрация</button>
      </div>
      <form onSubmit={submit} className="form-stack">
        <label>Email<input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></label>
        {mode !== 'reset' && <label>Пароль<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} minLength={6} required /></label>}
        <button className="primary full" disabled={busy}>{busy ? 'Подождите…' : mode === 'login' ? 'Войти' : mode === 'signup' ? 'Создать аккаунт' : 'Отправить ссылку'}</button>
      </form>
      {mode === 'signup' && <div className="user-agreement">
        <strong>*Пользовательское соглашение</strong>
        <p>Используя этот сайт, вы принимете тот факт, что администрация проекта не несёт ответственности за сохранность, потерю или повреждение размещённых вами данных. Не загружайте сюда пароли и другую важную конфиденциальную информацию.</p>
      </div>}
      <div className="auth-foot">
        <button className="text-button" onClick={() => setMode(mode === 'reset' ? 'login' : 'reset')}>
          {mode === 'reset' ? 'Вернуться ко входу' : 'Забыли пароль?'}
        </button>
        {mode === 'reset' && <p className="muted small">Ссылка откроет сайт. Затем задайте новый пароль в Supabase Auth.</p>}
      </div>
    </section>
  </main>;
}
