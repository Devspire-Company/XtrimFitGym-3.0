import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity, ArrowLeft, BarChart3, CalendarClock, ScanLine, Dumbbell,
  Home, IdCard, LogOut, Menu, PhilippinePeso, RefreshCw, Search, Settings, ShieldCheck,
  UserPlus, Users, WalletCards, WifiOff, X,
} from 'lucide-react';
import { adminApi, authApi, type AdminUser, type AttendanceRecord, type DashboardData, type GymSettings, type Member } from './api';

type Loadable<T> = { data?: T; loading: boolean; error?: string };
function useLoad<T>(loader: () => Promise<T>): Loadable<T> & { reload: () => void } {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<Loadable<T>>({ loading: true });
  useEffect(() => {
    let active = true;
    setState({ loading: true });
    loader().then((data) => active && setState({ data, loading: false })).catch((error: Error) => active && setState({ loading: false, error: error.message }));
    return () => { active = false; };
  }, [version]);
  return { ...state, reload: () => setVersion((value) => value + 1) };
}

const nav = [
  ['/dashboard', 'Dashboard', Home], ['/members', 'Members', Users], ['/memberships', 'Memberships', WalletCards],
  ['/nfc-cards', 'NFC Cards', IdCard], ['/attendance', 'Attendance', ScanLine], ['/walk-ins', 'Walk-ins', UserPlus],
  ['/payments', 'Cash Payments', PhilippinePeso], ['/coaches', 'Coaches', Dumbbell], ['/reports', 'Reports', BarChart3],
] as const;

function Shell({ user, onLogout }: { user: AdminUser; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const location = useLocation();
  return <div className="app-shell">
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
      <Link to="/dashboard" className="brand"><img src="/logo.png" alt="X-TRIM FIT GYM" /></Link>
      <div className="identity"><span className="avatar">{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><small>Gym {user.role === 'OWNER' ? 'Owner' : 'Administrator'}</small></div></div>
    </header>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <nav>{nav.map(([path, label, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={location.pathname === path ? 'active' : ''}><Icon /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-foot">
        <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}><Settings /><span>Settings</span></Link>
        <button onClick={() => setConfirmLogout(true)}><LogOut /><span>Log out</span></button>
      </div>
    </aside>
    <main className="main"><Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="/memberships" element={<MembershipsPage />} />
      <Route path="/nfc-cards" element={<CardsPage />} />
      <Route path="/attendance" element={<AttendancePage />} />
      <Route path="/walk-ins" element={<WalkInsPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/coaches" element={<StandardPage title="Coach Management" subtitle="Publish coach profiles and availability for members." icon={<Dumbbell />} endpoint="Coach records will come from the 3.0 API." />} />
      <Route path="/reports" element={<StandardPage title="Reports & Analytics" subtitle="Membership, attendance, walk-in and cash summaries from verified records." icon={<BarChart3 />} endpoint="Reports remain empty until authoritative transactions exist." />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes></main>
    {confirmLogout && <Modal title="Log out?" onClose={() => setConfirmLogout(false)}><p>You will need to sign in again to manage gym operations.</p><div className="modal-actions"><button className="button secondary" onClick={() => setConfirmLogout(false)}>Cancel</button><button className="button danger" onClick={onLogout}>Log out</button></div></Modal>}
  </div>;
}

function PageHeader({ title, subtitle, icon, action }: { title: string; subtitle: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="page-header"><div className="page-heading"><span>{icon}</span><div><h1>{title}</h1><p>{subtitle}</p></div></div>{action}</div>;
}
function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`panel ${className}`}>{children}</section>; }
function ConnectionState({ loading, error, reload, empty }: { loading: boolean; error?: string; reload: () => void; empty: string }) {
  if (loading) return <div className="state"><RefreshCw className="spin" /><strong>Loading verified records</strong></div>;
  if (error) return <div className="state error"><WifiOff /><strong>API unavailable</strong><span>{error}</span><button className="button secondary" onClick={reload}>Try again</button></div>;
  return <div className="state"><Activity /><strong>{empty}</strong><span>No sample records are shown.</span></div>;
}

function Dashboard() {
  const result = useLoad(adminApi.dashboard);
  const cards = result.data ? [
    ['Active members', result.data.activeMembers, Users], ['Attendance today', result.data.attendanceToday, ScanLine],
    ['Walk-ins today', result.data.walkInsToday, UserPlus], ['Cash received today', `₱${result.data.cashToday.toLocaleString()}`, PhilippinePeso],
    ['Cards pending', result.data.cardsPending, IdCard], ['Expiring soon', result.data.expiringSoon, CalendarClock],
  ] as const : [];
  return <><PageHeader title="Operations Dashboard" subtitle="Live gym activity from verified membership, payment and attendance records." icon={<Home />} />
    <Panel className="hero"><div><span className="eyebrow">X-TRIM CONTROL DESK</span><h2>Train hard.<br /><em>Manage smarter.</em></h2><p>Membership, cash, NFC attendance and walk-ins—one accountable workflow.</p></div><div className="hero-image" /></Panel>
    {result.data ? <><div className="stats">{cards.map(([label, value, Icon]) => <Panel key={label} className="stat"><Icon /><span>{label}</span><strong>{value}</strong></Panel>)}</div><Panel><div className="panel-title"><h3>Recent activity</h3></div>{result.data.recentActivity.length ? <div className="activity-list">{result.data.recentActivity.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.detail}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>)}</div> : <ConnectionState loading={false} reload={result.reload} empty="No activity recorded yet" />}</Panel></> : <Panel><ConnectionState {...result} reload={result.reload} empty="No operational records yet" /></Panel>}
  </>;
}

function MembersPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [showFlow, setShowFlow] = useState(false);
  const result = useLoad(() => adminApi.members(submitted));
  return <><PageHeader title="Member Management" subtitle="Create members, preserve walk-in history, activate plans and assign cards." icon={<Users />} action={<button className="button primary" onClick={() => setShowFlow(true)}><UserPlus />New member</button>} />
    <Panel><form className="toolbar" onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }}><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by member name, number or phone" /></label><button className="button secondary">Search</button></form></Panel>
    <Panel>{result.data?.items.length ? <MemberTable items={result.data.items} /> : <ConnectionState {...result} reload={result.reload} empty="No members found" />}</Panel>
    {showFlow && <EnrollmentFlow onClose={() => setShowFlow(false)} />}
  </>;
}
function MemberTable({ items }: { items: Member[] }) { return <div className="table-wrap"><table><thead><tr><th>Member</th><th>Membership</th><th>Expires</th><th>Card</th></tr></thead><tbody>{items.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong><small>{member.memberNumber}</small></td><td>{member.membership?.plan ?? 'No active plan'}</td><td>{member.membership?.expiresAt ? new Date(member.membership.expiresAt).toLocaleDateString() : '—'}</td><td><span className="status">{member.cardStatus ?? 'Unassigned'}</span></td></tr>)}</tbody></table></div>; }

function EnrollmentFlow({ onClose }: { onClose: () => void }) {
  const plans = useLoad(adminApi.plans); const [result,setResult]=useState<{memberNumber:string;username:string;temporaryPassword:string;paymentReference:string}|null>(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const data=new FormData(e.currentTarget);try{setResult(await adminApi.enroll({firstName:String(data.get('firstName')),lastName:String(data.get('lastName')),phone:String(data.get('phone')||'')||undefined,email:String(data.get('email')||'')||undefined,username:String(data.get('username')),planId:String(data.get('planId')),amountReceived:Number(data.get('amountReceived'))}))}catch(cause){setError(cause instanceof Error?cause.message:'Enrollment failed')}finally{setBusy(false)}};
  if(result)return <Modal title="Membership created" onClose={onClose}><div className="credential-box"><strong>Give these credentials to the member once</strong><span>Member no.: {result.memberNumber}</span><span>Username: {result.username}</span><span>Temporary password: {result.temporaryPassword}</span><span>Payment reference: {result.paymentReference}</span></div><p>The member must change this password at first sign-in. Continue to NFC Cards to assign a card.</p><div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div></Modal>;
  return <Modal title="New membership" onClose={onClose}><form className="form-grid" onSubmit={submit}><label>First name<input name="firstName" required/></label><label>Last name<input name="lastName" required/></label><label>Phone<input name="phone"/></label><label>Email<input name="email" type="email"/></label><label>Login username<input name="username" autoComplete="off" required minLength={3}/></label><label>Membership plan<select name="planId" required defaultValue=""><option value="" disabled>Select a plan</option>{plans.data?.items.filter(p=>p.isActive).map(p=><option key={p._id} value={p._id}>{p.name} · ₱{p.price}</option>)}</select></label><label>Cash received<input name="amountReceived" type="number" min="0" step="0.01" required/></label>{plans.error&&<div className="form-error full-row">{plans.error}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||!plans.data?.items.length}>{busy?'Saving…':'Create membership'}</button></div></form></Modal>;
}

function MembershipsPage(){const plans=useLoad(adminApi.plans);const[show,setShow]=useState(false);return <><PageHeader title="Membership Management" subtitle="Authoritative prices and durations used during enrollment." icon={<WalletCards/>} action={<button className="button primary" onClick={()=>setShow(true)}>New plan</button>}/><Panel>{plans.data?.items.length?<div className="table-wrap"><table><thead><tr><th>Plan</th><th>Price</th><th>Duration</th><th>Status</th></tr></thead><tbody>{plans.data.items.map(p=><tr key={p._id}><td><strong>{p.name}</strong></td><td>₱{p.price.toLocaleString()}</td><td>{p.durationDays} days</td><td><span className="status">{p.isActive?'Active':'Inactive'}</span></td></tr>)}</tbody></table></div>:<ConnectionState {...plans} reload={plans.reload} empty="No membership plans yet"/>}</Panel>{show&&<PlanModal onClose={()=>setShow(false)} onSaved={()=>{setShow(false);plans.reload()}}/>}</>}
function PlanModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){const[error,setError]=useState('');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{await adminApi.createPlan({name:String(d.get('name')),price:Number(d.get('price')),durationDays:Number(d.get('durationDays'))});onSaved()}catch(c){setError(c instanceof Error?c.message:'Could not create plan')}};return <Modal title="Create membership plan" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Plan name<input name="name" required/></label><label>Price (₱)<input name="price" type="number" min="0" step="0.01" required/></label><label>Duration (days)<input name="durationDays" type="number" min="1" required/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Create plan</button></div></form></Modal>}

function AttendancePage() {
  const records = useLoad(adminApi.attendance);
  const [mode, setMode] = useState(false);
  const [uid, setUid] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode) input.current?.focus(); }, [mode]);
  const scan = async (event: FormEvent) => { event.preventDefault(); if (!uid.trim() || busy) return; setBusy(true); try { const result = await adminApi.recordAttendance(uid.trim()); setMessage(result.message); setUid(''); records.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Scan failed'); } finally { setBusy(false); input.current?.focus(); } };
  return <><PageHeader title="NFC Attendance" subtitle="Only this authenticated attendance station can create official check-ins." icon={<ScanLine />} action={<button className={`button ${mode ? 'danger' : 'primary'}`} onClick={() => { setMode(!mode); setMessage(''); }}>{mode ? 'Stop attendance mode' : 'Start attendance mode'}</button>} />
    <Panel className={mode ? 'scanner active' : 'scanner'}><div><span className="eyebrow">R80C USB READER</span><h3>{mode ? 'Ready for a card' : 'Scanner is locked'}</h3><p>{mode ? 'Tap the NTAG215 card on the reader. Keep this window active.' : 'Start Attendance Mode before accepting any card input.'}</p></div><form onSubmit={scan}><input ref={input} value={uid} onChange={(e) => setUid(e.target.value)} disabled={!mode} autoComplete="off" aria-label="Card UID" placeholder="Card UID appears here" /><button className="button primary" disabled={!mode || busy}>Process</button></form>{message && <div className="scan-result">{message}</div>}</Panel>
    <Panel><div className="panel-title"><h3>Recent attendance</h3></div>{records.data?.items.length ? <AttendanceTable items={records.data.items} /> : <ConnectionState {...records} reload={records.reload} empty="No attendance records yet" />}</Panel>
  </>;
}
function AttendanceTable({ items }: { items: AttendanceRecord[] }) { return <div className="table-wrap"><table><thead><tr><th>Member</th><th>Member no.</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><strong>{row.memberName}</strong></td><td>{row.memberNumber}</td><td><span className="status">{row.status}</span></td><td>{new Date(row.recordedAt).toLocaleString()}</td></tr>)}</tbody></table></div>; }

function CardsPage() {
  const result = useLoad(adminApi.cards);
  const[show,setShow]=useState(false);
  return <><PageHeader title="NFC Card Management" subtitle="Assign, verify, revoke and replace physical membership cards." icon={<IdCard />} action={<button className="button primary" onClick={()=>setShow(true)}><IdCard />Assign card</button>} /><div className="notice"><ShieldCheck />Card UIDs and portal tokens are identifiers, never passwords.</div><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>UID</th><th>Assigned member</th><th>Status</th></tr></thead><tbody>{result.data.items.map((card) => <tr key={card.id}><td><code>{card.uid}</code></td><td>{card.memberName ?? 'Unassigned'}</td><td><span className="status">{card.status}</span></td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No NFC cards registered" />}</Panel>{show&&<CardModal onClose={()=>setShow(false)} onSaved={()=>{setShow(false);result.reload()}}/>}</>;
}
function CardModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){const members=useLoad(()=>adminApi.members());const[error,setError]=useState('');const[created,setCreated]=useState<{portalUrl:string;uid:string}|null>(null);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{setCreated(await adminApi.assignCard(String(d.get('memberId')),String(d.get('uid'))))}catch(c){setError(c instanceof Error?c.message:'Card assignment failed')}};if(created)return <Modal title="Card assigned" onClose={onSaved}><div className="credential-box"><strong>Write this URL to the NTAG215 card now</strong><span className="break-all">{created.portalUrl}</span><span>UID: {created.uid}</span></div><p>This complete URL is shown only once. Test both the R80C UID scan and the phone tap before handing over the card.</p><div className="modal-actions"><button className="button primary" onClick={onSaved}>Verified and saved</button></div></Modal>;return <Modal title="Assign NFC card" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Member<select name="memberId" required defaultValue=""><option value="" disabled>Select a member</option>{members.data?.items.map(m=><option key={m.id} value={m.id}>{m.fullName} · {m.memberNumber}</option>)}</select></label><label className="full-row">Card UID<input name="uid" required autoFocus placeholder="Tap the card on the R80C reader"/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Assign card</button></div></form></Modal>}
function WalkInsPage() {
  const result = useLoad(adminApi.walkIns);
  const[show,setShow]=useState(false);
  return <><PageHeader title="Walk-in Management" subtitle="Record cash visits, recognize returning guests and preserve conversion history." icon={<UserPlus />} action={<button className="button primary" onClick={()=>setShow(true)}><UserPlus />New walk-in</button>} /><div className="notice"><PhilippinePeso />The default fee is configured by the API. Ordinary walk-ins do not receive permanent NFC cards.</div><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Visitor</th><th>Total visits</th><th>Last visit</th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.visits}</td><td>{new Date(item.lastVisitAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No walk-in visits recorded" />}</Panel>{show&&<WalkInModal profiles={result.data?.items??[]} onClose={()=>setShow(false)} onSaved={()=>{setShow(false);result.reload()}}/>}</>;
}
function WalkInModal({profiles,onClose,onSaved}:{profiles:Array<{id:string;fullName:string}>;onClose:()=>void;onSaved:()=>void}){const[returning,setReturning]=useState('');const[error,setError]=useState('');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{await adminApi.recordWalkIn({firstName:String(d.get('firstName')||'Returning'),lastName:String(d.get('lastName')||'Guest'),phone:String(d.get('phone')||'')||undefined,profileId:returning||undefined,amountReceived:Number(d.get('amountReceived')),notes:String(d.get('notes')||'')||undefined});onSaved()}catch(c){setError(c instanceof Error?c.message:'Could not record walk-in')}};return <Modal title="Record walk-in" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Returning guest (optional)<select value={returning} onChange={e=>setReturning(e.target.value)}><option value="">Create a new walk-in profile</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>{!returning&&<><label>First name<input name="firstName" required/></label><label>Last name<input name="lastName" required/></label><label className="full-row">Phone<input name="phone"/></label></>}<label>Cash received<input name="amountReceived" type="number" min="0" step="0.01" required/></label><label>Notes<input name="notes"/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Record payment & visit</button></div></form></Modal>}
function PaymentsPage() {
  const result = useLoad(adminApi.payments);
  return <><PageHeader title="Cash Payments" subtitle="Authoritative over-the-counter transactions and receipt references." icon={<PhilippinePeso />} /><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Payer</th><th>Type</th><th>Amount</th><th>Received</th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td>{item.reference}</td><td>{item.payerName}</td><td>{item.type}</td><td>₱{item.amount.toLocaleString()}</td><td>{new Date(item.receivedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No cash payments recorded" />}</Panel></>;
}
function StandardPage({ title, subtitle, icon, endpoint }: { title: string; subtitle: string; icon: ReactNode; endpoint: string }) { return <><PageHeader title={title} subtitle={subtitle} icon={icon} /><Panel><div className="state"><Activity /><strong>Ready for the 3.0 API</strong><span>{endpoint}</span></div></Panel></>; }
function SettingsPage(){const settings=useLoad(adminApi.settings);return <><Link className="back" to="/dashboard"><ArrowLeft/>Back to dashboard</Link><PageHeader title="System Settings" subtitle="Gym operations, fees and attendance-station configuration." icon={<Settings/>}/>{settings.data?<SettingsEditor initial={settings.data}/>:<Panel><ConnectionState {...settings} reload={settings.reload} empty="Settings are not available"/></Panel>}</>}
function SettingsEditor({initial}:{initial:GymSettings}){const[value,setValue]=useState(initial);const[message,setMessage]=useState('');const save=async(e:FormEvent)=>{e.preventDefault();setMessage('');try{setValue(await adminApi.updateSettings(value));setMessage('Settings saved.')}catch(c){setMessage(c instanceof Error?c.message:'Could not save settings')}};return <form onSubmit={save}><div className="settings-grid"><Panel><h3>Walk-in fee</h3><p>This server-controlled amount is used for every new walk-in payment.</p><label className="setting-field">Amount (₱)<input type="number" min="0" step="0.01" value={value.defaultWalkInFee} onChange={e=>setValue({...value,defaultWalkInFee:Number(e.target.value)})}/></label></Panel><Panel><h3>Gym status</h3><p>AUTO uses normal hours. Override only when the gym opens or closes unusually.</p><label className="setting-field">Status<select value={value.gymStatusOverride} onChange={e=>setValue({...value,gymStatusOverride:e.target.value as GymSettings['gymStatusOverride']})}><option value="AUTO">Automatic</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option></select></label></Panel><Panel><h3>Hours shown to members</h3><p>Short, clear text displayed in the Member PWA.</p><label className="setting-field">Today's hours<input value={value.hoursToday} onChange={e=>setValue({...value,hoursToday:e.target.value})}/></label></Panel></div><div className="settings-save">{message&&<span>{message}</span>}<button className="button primary">Save settings</button></div></form>}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X /></button></div>{children}</div></div>; }

function Login({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onLogin(await authApi.login(username, password)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed'); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-visual"><img src="/logo.png" alt="X-TRIM FIT GYM" /><div><span className="eyebrow">ADMIN OPERATIONS</span><h1>Train hard.<br />Manage smarter.</h1><p>Membership, attendance and revenue under one accountable system.</p></div></section><section className="login-form"><div><span className="eyebrow">SECURE ADMIN PORTAL</span><h2>Welcome back</h2><p>Use your authorized administrator account.</p><form onSubmit={submit}><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>{error && <div className="form-error">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><small className="login-note">Accounts are created by the system owner. No public sign-up.</small></div></section></main>;
}

export default function App() {
  const [auth, setAuth] = useState<{ loading: boolean; user?: AdminUser }>({ loading: true });
  const navigate = useNavigate();
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true') {
      setAuth({ loading: false, user: { id: 'local-preview', firstName: 'Admin', lastName: 'Preview', role: 'OWNER' } });
      return;
    }
    authApi.me().then((user) => setAuth({ loading: false, user })).catch(() => setAuth({ loading: false }));
  }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { setAuth({ loading: false }); navigate('/login'); } }, [navigate]);
  if (auth.loading) return <div className="boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Securing admin portal…</span></div>;
  if (!auth.user) return <Routes><Route path="*" element={<Login onLogin={(user) => { setAuth({ loading: false, user }); navigate('/dashboard'); }} />} /></Routes>;
  return <Shell user={auth.user} onLogout={logout} />;
}
