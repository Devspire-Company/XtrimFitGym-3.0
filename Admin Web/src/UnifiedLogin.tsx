import { FormEvent, useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router';

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/v1');
type PortalUser = { id: string; role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'COACH'; firstName: string; lastName: string; mustChangePassword: boolean };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers); headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes((options.method ?? 'GET').toUpperCase())) headers.set('X-XTRIM-Request', '1');
  const response = await fetch(`${API_URL}${path}`, { ...options, credentials: 'include', headers });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || 'Sign in failed.'); }
  return response.json();
}

const destination = (user: PortalUser) => user.role === 'OWNER' || user.role === 'ADMIN' ? '/admin/dashboard' : '/portal/home';

function CardEntry() {
  const { token } = useParams(); const navigate = useNavigate();
  useEffect(() => { if (token) sessionStorage.setItem('xtrim-card-token', token); navigate('/login', { replace: true }); }, [token, navigate]);
  return <div className="unified-boot">Opening secure member portal…</div>;
}

function LoginPage() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [visible, setVisible] = useState(false); const [busy, setBusy] = useState(false); const [checking, setChecking] = useState(true); const [error, setError] = useState('');
  useEffect(() => { request<PortalUser>('/auth/me').then((user) => window.location.replace(destination(user))).catch(() => setChecking(false)); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { const cardToken = sessionStorage.getItem('xtrim-card-token') || undefined; const user = await request<PortalUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, portal: 'unified', cardToken }) }); sessionStorage.removeItem('xtrim-card-token'); window.location.replace(destination(user)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed.'); } finally { setBusy(false); } };
  if (checking) return <div className="unified-boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Checking your session…</span></div>;
  return <main className="unified-login"><section className="unified-visual"><img src="/logo.png" alt="X-TRIM FIT GYM" /><div><span>ONE X-TRIM PORTAL</span><h1><span>Train hard.</span><em>Manage smarter.</em></h1><p>One secure sign-in for gym owners, administrators, members, and coaches.</p></div></section><section className="unified-signin"><div><div className="unified-kicker"><span className="unified-eyebrow">SECURE ACCOUNT ACCESS</span></div><h2>Welcome back</h2><p>Enter the account provided by X-TRIM FIT GYM. We will open the correct portal automatically.</p><form onSubmit={submit}><label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder="Enter your username" required /></label><label>Password<div className="unified-password"><input type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" required /><button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff /> : <Eye />}</button></div></label>{error && <div className="unified-error">{error}</div>}<button className="unified-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'}</button></form><small>No public registration. Accounts are issued by gym management.</small></div></section></main>;
}

export default function UnifiedLogin() {
  return <Routes><Route path="/login" element={<LoginPage />} /><Route path="/c/:token" element={<CardEntry />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>;
}
