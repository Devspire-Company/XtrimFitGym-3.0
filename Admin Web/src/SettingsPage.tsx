import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowLeft, Building2, Check, ChevronRight, CircleUserRound, Eye, EyeOff, KeyRound,
  Laptop, LogOut, MonitorSmartphone, Plus, Power, RefreshCw, ShieldCheck, UserCog, Users, X,
} from 'lucide-react';
import {
  adminApi, authApi, type AdminAccount, type AdminUser, type AttendanceStation,
  type GymSettings, type SessionInfo,
} from './api';
import { PremiumSelect } from './FormControls';

type Tab = 'profile' | 'security' | 'operations' | 'stations' | 'accounts';
type Notice = { kind: 'success' | 'error'; text: string } | null;

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function formatDate(value?: string) { return value ? new Date(value).toLocaleString() : 'Never'; }

function SectionTitle({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <div className="settings-section-title"><span>{icon}</span><div><h2>{title}</h2><p>{description}</p></div>{action && <div className="settings-title-action">{action}</div>}</div>;
}

function Feedback({ notice }: { notice: Notice }) {
  if (!notice) return null;
  return <div className={`settings-feedback ${notice.kind}`} role="status">{notice.kind === 'success' ? <Check /> : <X />}{notice.text}</div>;
}

function PasswordField({ label, name, value, onChange, autoComplete }: { label: string; name: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [visible, setVisible] = useState(false);
  return <label>{label}<div className="settings-password"><input name={name} type={visible ? 'text' : 'password'} value={value} placeholder={`Enter ${label.toLowerCase()}`} onChange={(event) => onChange(event.target.value)} autoComplete={autoComplete} required /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? `Hide ${label}` : `Show ${label}`}>{visible ? <EyeOff /> : <Eye />}</button></div></label>;
}

function ConfirmDialog({ title, children, confirmLabel, danger, busy, onClose, onConfirm }: { title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onClose: () => void; onConfirm: () => void }) {
  return <div className="settings-modal-backdrop" onMouseDown={onClose}><div className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="settings-modal-head"><h2 id="settings-dialog-title">{title}</h2><button onClick={onClose} aria-label="Close"><X /></button></div><div className="settings-modal-body">{children}</div><div className="settings-modal-actions"><button className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className={`button ${danger ? 'danger' : 'primary'}`} onClick={onConfirm} disabled={busy}>{busy ? 'Working…' : confirmLabel}</button></div></div></div>;
}

export default function SettingsPage({ user, onUserChange }: { user: AdminUser; onUserChange: (user: AdminUser) => void }) {
  const [tab, setTab] = useState<Tab>('profile');
  const tabs: Array<[Tab, string, ReactNode]> = [
    ['profile', 'My profile', <CircleUserRound />], ['security', 'Security', <ShieldCheck />],
    ['operations', 'Gym operations', <Building2 />], ['stations', 'Attendance stations', <MonitorSmartphone />],
    ...(user.role === 'OWNER' ? [['accounts', 'Administrator accounts', <Users />] as [Tab, string, ReactNode]] : []),
  ];
  return <div className="settings-page">
    <Link className="settings-back" to="/dashboard"><ArrowLeft />Back to dashboard</Link>
    <div className="settings-layout">
      <aside className="settings-nav-panel"><div className="settings-profile-summary"><span className="settings-avatar">{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><small>{user.role === 'OWNER' ? 'Gym Owner' : 'Administrator'}</small></div></div><nav>{tabs.map(([value, label, icon]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{icon}<span>{label}</span><ChevronRight /></button>)}</nav></aside>
      <section className="settings-content">
        {tab === 'profile' && <ProfileSettings user={user} onUserChange={onUserChange} />}
        {tab === 'security' && <SecuritySettings />}
        {tab === 'operations' && <OperationsSettings />}
        {tab === 'stations' && <StationSettings canManage={user.role === 'OWNER'} />}
        {tab === 'accounts' && user.role === 'OWNER' && <AccountSettings currentUserId={user.id} />}
      </section>
    </div>
  </div>;
}

function ProfileSettings({ user, onUserChange }: { user: AdminUser; onUserChange: (user: AdminUser) => void }) {
  const [form, setForm] = useState({ firstName: user.firstName, lastName: user.lastName, username: user.username, currentPassword: '' });
  const [notice, setNotice] = useState<Notice>(null); const [busy, setBusy] = useState(false);
  const usernameChanged = form.username.trim().toLowerCase() !== user.username;
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setNotice(null); try { const updated = await authApi.updateProfile({ ...form, currentPassword: usernameChanged ? form.currentPassword : undefined }); onUserChange(updated); setForm((value) => ({ ...value, username: updated.username, currentPassword: '' })); setNotice({ kind: 'success', text: 'Profile updated.' }); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not update profile.') }); } finally { setBusy(false); } };
  return <><SectionTitle icon={<UserCog />} title="My profile" description="Your verified identity across the administration portal." /><form className="settings-form" onSubmit={submit}><div className="settings-form-grid"><label>First name<input value={form.firstName} placeholder="Enter first name" onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></label><label>Last name<input value={form.lastName} placeholder="Enter last name" onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></label><label>Username<input value={form.username} placeholder="Enter account username" onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" required minLength={3} /></label><label>Account role<input value={user.role === 'OWNER' ? 'Gym Owner' : 'Administrator'} disabled /></label>{usernameChanged && <label className="settings-full">Current password <span className="field-hint">Required to change your username</span><input type="password" value={form.currentPassword} placeholder="Enter your current password" onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" required /></label>}</div><Feedback notice={notice} /><div className="settings-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form></>;
}

function SecuritySettings() {
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' }); const [notice, setNotice] = useState<Notice>(null); const [busy, setBusy] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]); const [sessionError, setSessionError] = useState(''); const [loading, setLoading] = useState(true);
  const loadSessions = async () => { setLoading(true); setSessionError(''); try { setSessions((await authApi.sessions()).items); } catch (error) { setSessionError(message(error, 'Could not load sessions.')); } finally { setLoading(false); } };
  useEffect(() => { void loadSessions(); }, []);
  const change = async (event: FormEvent) => { event.preventDefault(); setNotice(null); if (passwords.next !== passwords.confirm) { setNotice({ kind: 'error', text: 'New passwords do not match.' }); return; } setBusy(true); try { await authApi.changePassword(passwords.current, passwords.next); setPasswords({ current: '', next: '', confirm: '' }); setNotice({ kind: 'success', text: 'Password changed. Other sessions were signed out.' }); void loadSessions(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not change password.') }); } finally { setBusy(false); } };
  const revoke = async () => { setBusy(true); setNotice(null); try { const result = await authApi.revokeOtherSessions(); setNotice({ kind: 'success', text: `${result.revoked} other session${result.revoked === 1 ? '' : 's'} signed out.` }); void loadSessions(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not revoke sessions.') }); } finally { setBusy(false); } };
  return <><SectionTitle icon={<KeyRound />} title="Security" description="Change your password and review authenticated devices." /><div className="settings-stack"><form className="settings-card settings-form" onSubmit={change}><h3>Change password</h3><p>Use at least 10 characters with uppercase, lowercase, and a number.</p><div className="settings-form-grid"><PasswordField label="Current password" name="currentPassword" value={passwords.current} onChange={(value) => setPasswords({ ...passwords, current: value })} autoComplete="current-password" /><PasswordField label="New password" name="newPassword" value={passwords.next} onChange={(value) => setPasswords({ ...passwords, next: value })} autoComplete="new-password" /><PasswordField label="Confirm new password" name="confirmPassword" value={passwords.confirm} onChange={(value) => setPasswords({ ...passwords, confirm: value })} autoComplete="new-password" /></div><Feedback notice={notice} /><div className="settings-actions"><button className="button primary" disabled={busy}>Change password</button></div></form><div className="settings-card"><div className="settings-card-head"><div><h3>Signed-in devices</h3><p>Sessions expire automatically. Remove other devices if you do not recognize them.</p></div><button className="button secondary" onClick={revoke} disabled={busy || sessions.filter((session) => !session.current).length === 0}><LogOut />Sign out other devices</button></div>{loading ? <div className="settings-loading"><RefreshCw className="spin" />Loading sessions…</div> : sessionError ? <div className="settings-inline-error">{sessionError}<button onClick={loadSessions}>Try again</button></div> : <div className="settings-list">{sessions.map((session) => <div key={session.id} className="settings-list-row"><Laptop /><div><strong>{session.current ? 'This device' : 'Signed-in device'}</strong><span>{session.userAgent}</span><small>Last active {formatDate(session.lastSeenAt)} · Expires {formatDate(session.expiresAt)}</small></div>{session.current && <span className="settings-pill good">Current</span>}</div>)}</div>}</div></div></>;
}

function OperationsSettings() {
  const [value, setValue] = useState<GymSettings | null>(null); const [notice, setNotice] = useState<Notice>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const load = async () => { setLoading(true); setNotice(null); try { setValue(await adminApi.settings()); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not load gym settings.') }); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const save = async (event: FormEvent) => { event.preventDefault(); if (!value) return; setBusy(true); setNotice(null); try { setValue(await adminApi.updateSettings(value)); setNotice({ kind: 'success', text: 'Gym operations updated.' }); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not save gym settings.') }); } finally { setBusy(false); } };
  return <><SectionTitle icon={<Building2 />} title="Gym operations" description="Server-controlled fees, availability, and hours used across both portals." />{loading ? <div className="settings-loading"><RefreshCw className="spin" />Loading settings…</div> : value ? <form className="settings-form" onSubmit={save}><div className="settings-form-grid"><label>Default walk-in fee (₱)<input type="number" min="0" step="0.01" placeholder="Enter the standard walk-in fee" inputMode="decimal" value={value.defaultWalkInFee} onChange={(e) => setValue({ ...value, defaultWalkInFee: Number(e.target.value) })} required /></label><label>First membership fee (₱)<input type="number" min="0" step="0.01" placeholder="Enter the one-time membership fee" inputMode="decimal" value={value.firstMembershipFee} onChange={(e) => setValue({ ...value, firstMembershipFee: Number(e.target.value) })} required /><span className="field-hint">Charged once when a member receives their first membership.</span></label><label>Gym status<PremiumSelect value={value.gymStatusOverride} onChange={(next) => setValue({ ...value, gymStatusOverride: next as GymSettings['gymStatusOverride'] })} placeholder="Choose gym status" options={[{value:'AUTO',label:'Automatic'},{value:'OPEN',label:'Open'},{value:'CLOSED',label:'Closed'}]} /></label><label>Hours shown to members<input value={value.hoursToday} onChange={(e) => setValue({ ...value, hoursToday: e.target.value })} required minLength={3} maxLength={100} placeholder="e.g. 6:00 AM – 10:00 PM" /></label></div><Feedback notice={notice} /><div className="settings-actions"><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save operations'}</button></div></form> : <><Feedback notice={notice} /><button className="button secondary" onClick={load}>Try again</button></>}</>;
}

function StationSettings({ canManage }: { canManage: boolean }) {
  const [items, setItems] = useState<AttendanceStation[]>([]); const [notice, setNotice] = useState<Notice>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<AttendanceStation | null>(null);
  const load = async () => { setLoading(true); try { setItems((await adminApi.stations()).items); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not load stations.') }); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setNotice(null); try { await adminApi.createStation({ name: String(data.get('name')), stationId: String(data.get('stationId')) }); form.reset(); setNotice({ kind: 'success', text: 'Attendance station registered.' }); await load(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not register station.') }); } finally { setBusy(false); } };
  const toggle = async () => { if (!confirm) return; setBusy(true); try { await adminApi.setStationStatus(confirm.id, !confirm.isActive); setConfirm(null); setNotice({ kind: 'success', text: `Station ${confirm.isActive ? 'disabled' : 'enabled'}.` }); await load(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not update station.') }); } finally { setBusy(false); } };
  return <><SectionTitle icon={<MonitorSmartphone />} title="Attendance stations" description="Only active, registered reception devices can submit NFC attendance." />{canManage && <form className="settings-card settings-inline-form" onSubmit={create}><div><h3>Register a station</h3><p>Use the same station ID in that device's VITE_ATTENDANCE_STATION_ID.</p></div><label>Station name<input name="name" required placeholder="Reception laptop" /></label><label>Station ID<input name="stationId" required minLength={8} pattern="[A-Za-z0-9_-]+" placeholder="reception-laptop-01" /></label><button className="button primary" disabled={busy}><Plus />Register</button></form>}<Feedback notice={notice} />{loading ? <div className="settings-loading"><RefreshCw className="spin" />Loading stations…</div> : <div className="settings-list">{items.length ? items.map((station) => <div key={station.id} className="settings-list-row"><MonitorSmartphone /><div><strong>{station.name}</strong><span>{station.stationId}</span><small>Registered {formatDate(station.createdAt)}</small></div><span className={`settings-pill ${station.isActive ? 'good' : ''}`}>{station.isActive ? 'Active' : 'Disabled'}</span>{canManage && <button className="button secondary compact" onClick={() => setConfirm(station)}><Power />{station.isActive ? 'Disable' : 'Enable'}</button>}</div>) : <div className="settings-empty">No attendance stations registered.</div>}</div>}{confirm && <ConfirmDialog title={`${confirm.isActive ? 'Disable' : 'Enable'} station?`} confirmLabel={confirm.isActive ? 'Disable station' : 'Enable station'} danger={confirm.isActive} busy={busy} onClose={() => setConfirm(null)} onConfirm={toggle}><p>{confirm.isActive ? `Attendance scans from “${confirm.name}” will be rejected until it is enabled again.` : `“${confirm.name}” will be allowed to submit attendance scans again.`}</p></ConfirmDialog>}</>;
}

function AccountSettings({ currentUserId }: { currentUserId: string }) {
  const [items, setItems] = useState<AdminAccount[]>([]); const [notice, setNotice] = useState<Notice>(null); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [confirm, setConfirm] = useState<{ action: 'status' | 'password'; account: AdminAccount } | null>(null); const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const load = async () => { setLoading(true); try { setItems((await adminApi.accounts()).items); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not load accounts.') }); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const create = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); setBusy(true); setNotice(null); try { const result = await adminApi.createAccount({ firstName: String(data.get('firstName')), lastName: String(data.get('lastName')), username: String(data.get('username')) }); setCredentials({ username: result.username, temporaryPassword: result.temporaryPassword }); form.reset(); await load(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not create administrator.') }); } finally { setBusy(false); } };
  const execute = async () => { if (!confirm) return; setBusy(true); setNotice(null); try { if (confirm.action === 'status') { await adminApi.setAccountStatus(confirm.account.id, !confirm.account.isActive); setNotice({ kind: 'success', text: `Administrator ${confirm.account.isActive ? 'disabled' : 'enabled'}.` }); } else { const result = await adminApi.resetAccountPassword(confirm.account.id); setCredentials({ username: confirm.account.username, temporaryPassword: result.temporaryPassword }); } setConfirm(null); await load(); } catch (error) { setNotice({ kind: 'error', text: message(error, 'Could not update administrator.') }); } finally { setBusy(false); } };
  return <>
    <SectionTitle icon={<Users />} title="Administrator accounts" description="Owner-only control of staff access. Passwords are generated and shown once." />
    <form className="settings-card settings-account-form" onSubmit={create}>
      <div><h3>Create administrator</h3><p>The administrator must replace the temporary password at first sign-in.</p></div>
      <label>First name<input name="firstName" placeholder="Enter first name" required /></label>
      <label>Last name<input name="lastName" placeholder="Enter last name" required /></label>
      <label>Username<input name="username" placeholder="Create an account username" required minLength={3} autoComplete="off" /></label>
      <button className="button primary" disabled={busy}><Plus />Create account</button>
    </form>
    <Feedback notice={notice} />
    {loading ? <div className="settings-loading"><RefreshCw className="spin" />Loading accounts…</div> : <div className="settings-list">{items.map((account) => <div key={account.id} className="settings-list-row">
      <CircleUserRound />
      <div><strong>{account.firstName} {account.lastName}</strong><span>@{account.username} · {account.role === 'OWNER' ? 'Gym Owner' : 'Administrator'}</span><small>Last sign-in {formatDate(account.lastLoginAt)}</small></div>
      <span className={`settings-pill ${account.isActive ? 'good' : ''}`}>{account.isActive ? 'Active' : 'Disabled'}</span>
      {account.role === 'ADMIN' && account.id !== currentUserId && <div className="settings-row-actions"><button className="button secondary compact" onClick={() => setConfirm({ action: 'password', account })}><KeyRound />Reset password</button><button className={`button compact ${account.isActive ? 'danger' : 'secondary'}`} onClick={() => setConfirm({ action: 'status', account })}><Power />{account.isActive ? 'Disable' : 'Enable'}</button></div>}
    </div>)}</div>}
    {confirm && <ConfirmDialog title={confirm.action === 'password' ? 'Reset administrator password?' : `${confirm.account.isActive ? 'Disable' : 'Enable'} administrator?`} confirmLabel={confirm.action === 'password' ? 'Reset password' : confirm.account.isActive ? 'Disable account' : 'Enable account'} danger={confirm.action === 'status' && confirm.account.isActive} busy={busy} onClose={() => setConfirm(null)} onConfirm={execute}><p>{confirm.action === 'password' ? `All sessions for ${confirm.account.firstName} will end. A new temporary password will be shown once.` : confirm.account.isActive ? `${confirm.account.firstName} will immediately lose access and all sessions will end.` : `${confirm.account.firstName} will be able to sign in again.`}</p></ConfirmDialog>}
    {credentials && <div className="settings-modal-backdrop"><div className="settings-modal" role="dialog" aria-modal="true"><div className="settings-modal-head"><h2>Temporary credentials</h2><button onClick={() => setCredentials(null)} aria-label="Close"><X /></button></div><div className="credential-box"><strong>Give this directly to the administrator</strong><span>Username: {credentials.username}</span><span>Temporary password: {credentials.temporaryPassword}</span></div><p className="settings-secret-note">This password will not be shown again. The account must change it at first sign-in.</p><div className="settings-modal-actions"><button className="button primary" onClick={() => setCredentials(null)}>I saved it securely</button></div></div></div>}
  </>;
}
