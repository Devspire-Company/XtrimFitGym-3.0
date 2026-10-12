import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity, Archive, BarChart3, Bell, CalendarClock, CheckCheck, ChevronDown, Download, ScanLine, Dumbbell, Eye, EyeOff, Megaphone,
  Home, IdCard, KeyRound, LogOut, Menu, PhilippinePeso, RefreshCw, Search, Settings, ShieldCheck,
  CheckCircle2, LayoutGrid, LockKeyhole, Pencil, Printer, RotateCcw, Table2, Trash2, TrendingUp, UserCheck, UserPlus, UserRound, UserX, Users, WalletCards, WifiOff, X,
} from 'lucide-react';
import { adminApi, authApi, type AdminNotification, type AdminUser, type Announcement, type AttendanceRecord, type CashClosing, type Coach, type CoachAvailability, type CoachDay, type DashboardData, type Member, type MemberType, type PaymentDetail, type Plan, type PlanEligibility, type ReportData, type WalkInProfile } from './api';
import { capitalizeNameParts, formatMobileNumber, PremiumDatePicker, PremiumDateTimePicker, PremiumMultiSelect, PremiumSelect, PremiumTimePicker, ReasonSelect } from './FormControls';
import FunctionalSettingsPage from './SettingsPage';
import MemberDetailPage from './MemberDetailPage';

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
  ['/payments', 'Cash Payments', PhilippinePeso], ['/coaches', 'Coaches', Dumbbell], ['/announcements', 'Announcements', Megaphone], ['/reports', 'Reports', BarChart3],
] as const;

function notificationAge(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

function NotificationsMenu() {
  const navigate = useNavigate();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const result = await adminApi.notifications();
      setItems(result.items);
      setUnread(result.unread);
      setError('');
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : 'Notifications could not be loaded.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = window.setInterval(() => { if (!document.hidden) void load(true); }, 60_000);
    const onFocus = () => void load(true);
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(refresh); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  const openNotification = async (item: AdminNotification) => {
    if (busy) return;
    if (!item.readAt) {
      setBusy(item.id);
      try {
        const updated = await adminApi.readNotification(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? updated : entry));
        setUnread((count) => Math.max(0, count - 1));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The notification could not be opened.');
        setBusy('');
        return;
      }
      setBusy('');
    }
    setOpen(false);
    if (item.actionUrl) navigate(item.actionUrl.replace(/^\/admin/, '') || '/dashboard');
  };

  const readAll = async () => {
    if (!unread || busy) return;
    setBusy('read-all');
    try {
      await adminApi.readAllNotifications();
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) => item.readAt ? item : { ...item, readAt }));
      setUnread(0);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Notifications could not be marked as read.'); }
    finally { setBusy(''); }
  };

  const remove = async (item: AdminNotification) => {
    if (busy) return;
    setBusy(item.id);
    try {
      await adminApi.deleteNotification(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (!item.readAt) setUnread((count) => Math.max(0, count - 1));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The notification could not be deleted.'); }
    finally { setBusy(''); }
  };

  const clearRead = async () => {
    if (busy || !items.some((item) => item.readAt)) return;
    setBusy('clear-read');
    try {
      await adminApi.clearReadNotifications();
      setItems((current) => current.filter((item) => !item.readAt));
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Read notifications could not be cleared.'); }
    finally { setBusy(''); }
  };

  return <div className="notification-center" ref={container}>
    <button type="button" className={`notification-trigger ${unread ? 'has-unread' : ''}`} aria-label={unread ? `${unread} unread notifications` : 'Notifications'} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen((value) => !value); if (!open) void load(true); }}><Bell />{unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}</button>
    {open && <section className="notification-panel" role="dialog" aria-label="Notifications">
      <header><div><span className="notification-kicker">Admin inbox</span><h2>Notifications</h2></div>{unread > 0 && <button type="button" onClick={() => void readAll()} disabled={Boolean(busy)}><CheckCheck />Mark all read</button>}</header>
      {error && <div className="notification-error">{error}<button type="button" onClick={() => void load()}>Retry</button></div>}
      <div className="notification-list">
        {loading ? <div className="notification-empty"><RefreshCw className="spin" /><strong>Checking updates</strong><span>Loading the latest admin alerts.</span></div> : items.length ? items.map((item) => {
          const Icon = item.type === 'CARD_REQUIRED' ? IdCard : item.type === 'MEMBERSHIP_EXPIRING' ? CalendarClock : item.type === 'PAYMENT_VOIDED' ? PhilippinePeso : KeyRound;
          const category = item.type === 'CARD_REQUIRED' ? 'NFC card' : item.type === 'MEMBERSHIP_EXPIRING' ? 'Membership' : item.type === 'PAYMENT_VOIDED' ? 'Payment review' : 'Account security';
          return <article key={item.id} className={`${item.readAt ? '' : 'unread'} tone-${item.tone.toLowerCase()}`}>
            <button type="button" className="notification-content" disabled={busy === item.id} onClick={() => void openNotification(item)}>
              <span className="notification-icon"><Icon /></span><span className="notification-copy"><strong>{item.title}</strong><span>{item.message}</span><span className="notification-meta"><em>{category}</em><time dateTime={item.createdAt}>{notificationAge(item.createdAt)}</time></span></span>{!item.readAt && <i aria-label="Unread" />}
            </button>
            <button type="button" className="notification-delete" aria-label={`Delete: ${item.title}`} disabled={Boolean(busy)} onClick={() => void remove(item)}><Trash2 /></button>
          </article>;
        }) : <div className="notification-empty"><CheckCircle2 /><strong>You are all caught up</strong><span>Important operational and security updates will appear here.</span></div>}
      </div>
      {items.some((item) => item.readAt) && <footer><button type="button" disabled={Boolean(busy)} onClick={() => void clearRead()}><Trash2 />Clear read notifications</button></footer>}
    </section>}
  </div>;
}

function Shell({ user, onLogout, onUserChange }: { user: AdminUser; onLogout: () => Promise<void>; onUserChange: (user: AdminUser) => void }) {
  const [open, setOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [announcementsEnabled, setAnnouncementsEnabled] = useState(true);
  const location = useLocation();
  useEffect(() => {
    let active = true;
    void adminApi.settings().then((settings) => { if (active) setAnnouncementsEnabled(settings.announcementsEnabled); }).catch(() => undefined);
    const onSettingsUpdated = (event: Event) => setAnnouncementsEnabled((event as CustomEvent<{ announcementsEnabled: boolean }>).detail.announcementsEnabled);
    window.addEventListener('xtrim:settings-updated', onSettingsUpdated);
    return () => { active = false; window.removeEventListener('xtrim:settings-updated', onSettingsUpdated); };
  }, []);
  const visibleNav = nav.filter(([path]) => announcementsEnabled || path !== '/announcements');
  return <div className="app-shell">
    <header className="topbar">
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Open navigation"><Menu /></button>
      <Link to="/dashboard" className="brand"><img src="/logo.png" alt="X-TRIM FIT GYM" /></Link>
      <div className="topbar-account"><NotificationsMenu /><div className="identity"><span className="avatar">{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><small>Gym {user.role === 'OWNER' ? 'Owner' : 'Administrator'}</small></div></div></div>
    </header>
    {open && <button className="scrim" onClick={() => setOpen(false)} aria-label="Close navigation" />}
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <nav>{visibleNav.map(([path, label, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={location.pathname === path || (path === '/members' && location.pathname.startsWith('/members/')) ? 'active' : ''}><Icon /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-foot">
        <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}><Settings /><span>Settings</span></Link>
        <button onClick={() => setConfirmLogout(true)}><LogOut /><span>Log out</span></button>
      </div>
    </aside>
    <main className="main"><Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="/members/:memberId" element={<MemberDetailPage />} />
      <Route path="/memberships" element={<MembershipsPage viewerRole={user.role} />} />
      <Route path="/nfc-cards" element={<CardsPage />} />
      <Route path="/attendance" element={<AttendancePage />} />
      <Route path="/walk-ins" element={<WalkInsPage />} />
      <Route path="/payments" element={<PaymentsPage viewerRole={user.role} />} />
      <Route path="/coaches" element={<CoachesPage viewerRole={user.role} />} />
      <Route path="/announcements" element={announcementsEnabled ? <AnnouncementsPage viewerRole={user.role} /> : <Navigate to="/settings?tab=operations" replace />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/audit" element={<Navigate to="/settings?tab=audit" replace />} />
      <Route path="/settings" element={<FunctionalSettingsPage user={user} onUserChange={onUserChange} />} />
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
  const [activityOpen, setActivityOpen] = useState(false);
  const cards = result.data ? [
    ['Active members', result.data.activeMembers, Users], ['Attendance today', result.data.attendanceToday, ScanLine],
    ['Walk-ins today', result.data.walkInsToday, UserPlus], ['Cash received today', `₱${result.data.cashToday.toLocaleString()}`, PhilippinePeso],
    ['Cards pending', result.data.cardsPending, IdCard], ['Expiring soon', result.data.expiringSoon, CalendarClock],
  ] as const : [];
  const attentionCount = result.data ? result.data.cardsPending + result.data.expiringSoon : 0;
  return <div className="dashboard-page">
    <Panel className="hero"><div className="hero-copy"><span className="eyebrow">X-TRIM CONTROL DESK</span><h2><span>Train hard.</span><em>Manage smarter.</em></h2><p>Membership, cash, NFC attendance and walk-ins—one accountable workflow.</p></div><div className="hero-image" aria-hidden="true" /></Panel>
    {result.data ? <><div className="stats">{cards.map(([label, value, Icon]) => <Panel key={label} className="stat"><div className="stat-icon"><Icon /></div><div className="stat-copy"><span>{label}</span><strong>{label === 'Cash received today' ? <><b className="stat-peso">₱</b>{String(value).replace(/^₱/, '')}</> : value}</strong></div></Panel>)}</div>
      <div className="dashboard-operations">
        <Panel className="dashboard-attention"><div className="dashboard-section-head"><div><span>Operational overview</span><h3>Needs attention</h3></div><b className={attentionCount ? 'has-items' : ''}>{attentionCount}</b></div>{attentionCount ? <div className="attention-list">{result.data.expiringSoon > 0 && <Link to="/members"><span className="attention-icon"><CalendarClock /></span><div><strong>{result.data.expiringSoon} {result.data.expiringSoon === 1 ? 'membership expires' : 'memberships expire'} soon</strong><small>Review memberships ending within seven days.</small></div><ChevronDown /></Link>}{result.data.cardsPending > 0 && <Link to="/nfc-cards"><span className="attention-icon"><IdCard /></span><div><strong>{result.data.cardsPending} {result.data.cardsPending === 1 ? 'member needs' : 'members need'} an NFC card</strong><small>Assign cards for faster attendance recording.</small></div><ChevronDown /></Link>}</div> : <div className="attention-clear"><CheckCircle2 /><div><strong>Everything looks clear</strong><small>No expiring memberships or pending cards need attention.</small></div></div>}</Panel>
        <Panel className="dashboard-shortcuts"><div className="dashboard-section-head"><div><span>Common tasks</span><h3>Quick actions</h3></div></div><div className="shortcut-grid"><Link to="/members"><UserPlus /><span><strong>New member</strong><small>Enroll and activate</small></span></Link><Link to="/attendance"><ScanLine /><span><strong>Attendance</strong><small>Scan or record manually</small></span></Link><Link to="/walk-ins"><UserRound /><span><strong>Walk-in</strong><small>Record a counter visit</small></span></Link><Link to="/reports"><BarChart3 /><span><strong>Reports</strong><small>Review gym performance</small></span></Link></div></Panel>
      </div>
      <Panel className={`dashboard-activity ${activityOpen ? 'is-open' : ''}`}><button type="button" className="dashboard-activity-toggle" aria-expanded={activityOpen} onClick={() => setActivityOpen((open) => !open)}><div><h3>Recent activity</h3><span>{result.data.recentActivity.length ? `${result.data.recentActivity.length} latest system records` : 'No activity recorded yet'}</span></div><ChevronDown /></button>{activityOpen && (result.data.recentActivity.length ? <div className="activity-list">{result.data.recentActivity.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.detail}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>)}</div> : <ConnectionState loading={false} reload={result.reload} empty="No activity recorded yet" />)}</Panel></> : <Panel><ConnectionState {...result} reload={result.reload} empty="No operational records yet" /></Panel>}
  </div>;
}

function MembersPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [status, setStatus] = useState('');
  const [submittedStatus, setSubmittedStatus] = useState('');
  const [page, setPage] = useState(1);
  const [showFlow, setShowFlow] = useState(false);
  const result = useLoad(() => adminApi.members(submitted, page, 25, submittedStatus));
  const changePage = (next: number) => { setPage(next); result.reload(); };
  return <><PageHeader title="Member Management" subtitle="Create members, preserve walk-in history, activate plans and assign cards." icon={<Users />} action={<button className="button primary" onClick={() => setShowFlow(true)}><UserPlus />New member</button>} />
    <Panel><form className="toolbar member-toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setSubmitted(query); setSubmittedStatus(status); result.reload(); }}><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by member name, number or phone" /></label><PremiumSelect value={status} onChange={setStatus} options={[{ value: '', label: 'All accounts' }, { value: 'ACTIVE', label: 'Active accounts' }, { value: 'DISABLED', label: 'Disabled accounts' }]} placeholder="All accounts" /><button className="button secondary">Search</button></form></Panel>
    <Panel className="member-results-panel">{result.data?.items.length ? <><MemberTable items={result.data.items} /><div className="pagination"><span>{result.data.total} members · Page {result.data.page} of {result.data.pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><button className="button secondary" disabled={page >= result.data.pages} onClick={() => changePage(page + 1)}>Next</button></div></div></> : <ConnectionState {...result} reload={result.reload} empty="No members found" />}</Panel>
    {showFlow && <EnrollmentFlow onClose={() => { setShowFlow(false); result.reload(); }} />}
  </>;
}
function MemberTable({ items }: { items: Member[] }) { return <div className="table-wrap"><table><thead><tr><th>Member</th><th>Account</th><th>Membership</th><th>Expires</th><th>Card</th><th></th></tr></thead><tbody>{items.map((member) => <tr key={member.id}><td><strong>{member.fullName}</strong><small>{member.memberNumber}</small></td><td><span className="status">{member.status}</span></td><td>{member.membership ? <><strong>{member.membership.plan}</strong><small>{member.membership.status}</small></> : 'No membership'}</td><td>{member.membership?.expiresAt ? new Date(member.membership.expiresAt).toLocaleDateString() : '—'}</td><td><span className="status">{member.cardStatus ?? 'Unassigned'}</span></td><td><Link className="button secondary" to={`/members/${member.id}`}>View member</Link></td></tr>)}</tbody></table></div>; }

function EnrollmentFlow({ onClose }: { onClose: () => void }) {
  const plans = useLoad(adminApi.plans);
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({ firstName: '', lastName: '', phone: '', email: '', birthDate: '', emergencyName: '', emergencyRelationship: '', emergencyPhone: '' });
  const [planId, setPlanId] = useState('');
  const [memberType, setMemberType] = useState<MemberType>('REGULAR');
  const [studentIdVerified, setStudentIdVerified] = useState(false);
  const [amountReceived, setAmountReceived] = useState('');
  const [username, setUsername] = useState('');
  const [result, setResult] = useState<{memberId:string;memberNumber:string;username:string;temporaryPassword:string;paymentReference:string}|null>(null);
  const [credentialsConfirmed, setCredentialsConfirmed] = useState(false);
  const [cardUid, setCardUid] = useState('');
  const [cardResult, setCardResult] = useState<{portalUrl:string;uid:string}|null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const activePlans = (plans.data?.items ?? []).filter((plan) => plan.isActive && (plan.eligibility === 'ALL' || plan.eligibility === memberType));
  const selectedPlan = activePlans.find((plan) => plan._id === planId);
  const firstMembershipFee = plans.data?.firstMembershipFee ?? 100;
  const totalDue = selectedPlan ? selectedPlan.price + firstMembershipFee : 0;
  const updateDetail = (key: keyof typeof details, value: string) => setDetails((current) => ({ ...current, [key]: value }));
  const nextFromDetails = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setError(''); setStep(2); };
  const nextFromPlan = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (memberType === 'STUDENT' && !studentIdVerified) { setError('Confirm that the member presented a valid student ID.'); return; }
    if (!selectedPlan) { setError('Choose an available membership plan.'); return; }
    setStep(3);
  };
  const nextFromPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (!selectedPlan) { setError('Return to the previous step and choose a membership plan.'); return; }
    if (selectedPlan && Number(amountReceived) < totalDue) { setError(`Cash received must be at least ₱${totalDue.toLocaleString()}.`); return; }
    setStep(4);
  };
  const createMembership = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await adminApi.enroll({
        firstName: details.firstName,
        lastName: details.lastName,
        birthDate: details.birthDate,
        phone: details.phone || undefined,
        email: details.email || undefined,
        emergencyContact: { name: details.emergencyName, relationship: details.emergencyRelationship, phone: details.emergencyPhone },
        memberType,
        studentIdVerified,
        username,
        planId,
        amountReceived: Number(amountReceived),
      });
      setResult(created);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Enrollment failed'); }
    finally { setBusy(false); }
  };
  const assignCard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!result) return; setBusy(true); setError('');
    try { setCardResult(await adminApi.assignCard(result.memberId, cardUid.trim())); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Card assignment failed'); }
    finally { setBusy(false); }
  };
  const hasUnsavedInput = Object.values(details).some(Boolean) || Boolean(planId || amountReceived || username || cardUid || studentIdVerified) || memberType !== 'REGULAR' || step > 1;
  const closeWizard = () => {
    if (result && !credentialsConfirmed) { setError('Save or give the one-time credentials to the member before closing this enrollment.'); return; }
    if (!result && hasUnsavedInput) { setShowDiscardConfirm(true); return; }
    onClose();
  };
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      if (showDiscardConfirm) setShowDiscardConfirm(false);
      else closeWizard();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  });
  const enrollmentSteps = [
    { title: 'Member details', icon: <UserRound /> },
    { title: 'Membership plan', icon: <WalletCards /> },
    { title: 'Counter payment', icon: <PhilippinePeso /> },
    { title: 'Account credentials', icon: <KeyRound /> },
    { title: 'NFC card', icon: <IdCard /> },
  ];
  return <Modal title="New membership" onClose={closeWizard} className="enrollment-modal"><div className="enrollment-wizard">
    <ol className="enrollment-progress">{enrollmentSteps.map((item,index)=><li key={item.title} className={step===index+1?'current':step>index+1?'complete':''}><span>{step>index+1?<CheckCircle2/>:item.icon}</span><small>{item.title}</small></li>)}</ol>
    {step===1&&<form className="form-grid enrollment-form enrollment-details" onSubmit={nextFromDetails}><div className="step-intro full-row"><span>Step 1 of 5</span><h3>Personal information</h3></div><div className="identity-fields full-row"><label>First name<input value={details.firstName} onChange={(e)=>updateDetail('firstName',capitalizeNameParts(e.target.value))} placeholder="Enter first name" autoComplete="given-name" autoCapitalize="words" required/></label><label>Last name<input value={details.lastName} onChange={(e)=>updateDetail('lastName',capitalizeNameParts(e.target.value))} placeholder="Enter last name" autoComplete="family-name" autoCapitalize="words" required/></label><label>Mobile number<input value={details.phone} onChange={(e)=>updateDetail('phone',formatMobileNumber(e.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" autoComplete="tel" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" required/></label></div><div className="secondary-fields full-row"><label>Email<input value={details.email} onChange={(e)=>updateDetail('email',e.target.value)} type="email" placeholder="name@email.com" autoComplete="email"/></label><label>Birth date<PremiumDatePicker name="birthDate" value={details.birthDate} onChange={(value)=>updateDetail('birthDate',value)} placeholder="Select birth date" max={new Date().toISOString().slice(0,10)} variant="wheel" required/></label></div><section className="emergency-fields full-row"><div className="enrollment-section-title"><span>Emergency contact</span></div><div><label>Full name<input value={details.emergencyName} onChange={(e)=>updateDetail('emergencyName',capitalizeNameParts(e.target.value))} placeholder="Enter full name" autoComplete="off" autoCapitalize="words" required/></label><label>Relationship<PremiumSelect value={details.emergencyRelationship} onChange={(value)=>updateDetail('emergencyRelationship',value)} required placement="up" placeholder="Choose relationship" options={['Parent','Spouse or partner','Sibling','Guardian','Relative','Friend','Other'].map((label)=>({value:label,label}))}/></label><label>Mobile number<input value={details.emergencyPhone} onChange={(e)=>updateDetail('emergencyPhone',formatMobileNumber(e.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" autoComplete="off" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" required/></label></div></section><div className="modal-actions full-row"><button type="button" className="button secondary" onClick={closeWizard}>Cancel</button><button className="button primary">Continue</button></div></form>}
    {step===2&&<form className="form-grid enrollment-form enrollment-plan-step" onSubmit={nextFromPlan}><div className="step-intro full-row"><span>Step 2 of 5</span><h3>Choose membership plan</h3><p>Select the correct member category and plan. The signed paper agreement is handled separately at the counter.</p></div><label>Member type<PremiumSelect value={memberType} onChange={(value)=>{setMemberType(value as MemberType);setStudentIdVerified(false);setPlanId('');setAmountReceived('');setError('')}} required placeholder="Choose member type" options={[{value:'REGULAR',label:'Regular'},{value:'STUDENT',label:'Student'}]}/></label>{memberType==='STUDENT'?<label className="student-verification"><span>Student verification</span><span className="verification-check"><input type="checkbox" checked={studentIdVerified} onChange={(event)=>setStudentIdVerified(event.target.checked)} required/>Valid student ID presented</span></label>:<div className="eligibility-note"><span>Pricing eligibility</span><strong>Regular membership plans</strong></div>}<label className="full-row">Membership plan<PremiumSelect value={planId} onChange={(value)=>{setPlanId(value);setAmountReceived('');setError('')}} required placeholder="Choose a membership plan" options={activePlans.map((plan)=>({value:plan._id,label:`${plan.name} · ₱${plan.price.toLocaleString()} · ${plan.durationDays} days${plan.isPromo?' · Promo':''}`}))}/></label><div className="paper-agreement-note full-row"><strong>Paper agreement</strong><span>Membership terms, privacy notice, and liability acknowledgement stay on the gym's signed paper form and are not recorded as digital consent.</span></div>{plans.error&&<div className="form-error full-row">{plans.error}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');setStep(1)}}>Back</button><button className="button primary" disabled={!activePlans.length}>Continue to payment</button></div></form>}
    {step===3&&<form className="form-grid enrollment-form enrollment-payment-step" onSubmit={nextFromPayment}><div className="step-intro full-row"><span>Step 3 of 5</span><h3>Counter payment</h3><p>Receive the member's cash and verify the change before creating the account.</p></div><section className="pos-panel full-row"><div className="pos-order"><span>Selected plan</span><strong>{selectedPlan?.name ?? 'No plan selected'}</strong><dl><div><dt>Plan price</dt><dd>{selectedPlan?`₱${selectedPlan.price.toLocaleString()}`:'—'}</dd></div><div><dt>First membership fee</dt><dd>₱{firstMembershipFee.toLocaleString()}</dd></div></dl><div className="pos-total"><span>Total due</span><strong>{selectedPlan?`₱${totalDue.toLocaleString()}`:'—'}</strong></div></div><div className="pos-tender"><label>Cash received<div className={`currency-input${amountReceived?' has-value':''}`}>{amountReceived&&<span aria-hidden="true">₱</span>}<input type="number" min="0" step="0.01" placeholder="Enter cash received" inputMode="decimal" value={amountReceived} onChange={(event)=>{setAmountReceived(event.target.value);setError('')}} autoFocus required/></div></label><div className={`change-display ${amountReceived&&Number(amountReceived)>=totalDue?'ready':''}`}><span>Change</span><strong>{selectedPlan&&amountReceived&&Number(amountReceived)>=totalDue?`₱${(Number(amountReceived)-totalDue).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—'}</strong><small>{amountReceived&&Number(amountReceived)<totalDue?`Still due: ₱${(totalDue-Number(amountReceived)).toLocaleString()}`:'Confirm this amount before continuing.'}</small></div></div></section>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');setStep(2)}}>Back</button><button className="button primary">Confirm payment</button></div></form>}
    {step===4&&!result&&<form className="form-grid enrollment-form" onSubmit={createMembership}><div className="step-intro full-row"><span>Step 4 of 5</span><h3>Create member account</h3><p>Choose the member portal username. The system will securely generate a temporary password.</p></div><label className="full-row">Member username<input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Create a member username" autoComplete="off" minLength={3} required/></label><div className="creation-summary full-row"><div><span>Member</span><strong>{details.firstName} {details.lastName}</strong></div><div><span>Plan</span><strong>{selectedPlan?.name}</strong></div><div><span>Payment</span><strong>₱{totalDue.toLocaleString()} received</strong></div></div><div className="notice full-row"><ShieldCheck/>Creating the account also activates the membership and records the confirmed cash payment as one protected transaction.</div>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');setStep(3)}}>Back</button><button className="button primary" disabled={busy}>{busy?'Creating…':'Create membership'}</button></div></form>}
    {step===4&&result&&<div className="credential-step"><div className="step-intro"><span>Step 4 of 5</span><h3>Account created</h3><p>Give these one-time credentials to the member before continuing.</p></div><div className="credential-box account-credential-box"><div><span>Member number:</span><strong>{result.memberNumber}</strong></div><div><span>Username:</span><strong>{result.username}</strong></div><div><span>Temporary password:</span><strong>{result.temporaryPassword}</strong></div><div><span>Payment reference:</span><strong>{result.paymentReference}</strong></div></div><label className="credential-confirm"><input type="checkbox" checked={credentialsConfirmed} onChange={(e)=>{setCredentialsConfirmed(e.target.checked);setError('')}}/><span>I have securely given or saved these credentials.</span></label><div className="notice"><ShieldCheck/>The member must replace the temporary password during their first portal login.</div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="button primary" disabled={!credentialsConfirmed} onClick={()=>setStep(5)}>Continue to NFC card</button></div></div>}
    {step===5&&!cardResult&&<form className="form-grid enrollment-form" onSubmit={assignCard}><div className="step-intro full-row"><span>Step 5 of 5</span><h3>Assign NFC card</h3><p>Tap the blank card on the R80C reader, then verify the detected UID before assigning it.</p></div><label className="full-row">Card UID<input value={cardUid} onChange={(e)=>setCardUid(e.target.value)} placeholder="Tap the card on the R80C reader" autoFocus minLength={4} required/></label><div className="notice full-row"><IdCard/>The card will be linked only to {details.firstName} {details.lastName}. It can be revoked or replaced later.</div>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions enrollment-final-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Assign card later</button><button className="button primary" disabled={busy}>{busy?'Assigning…':'Assign card'}</button></div></form>}
    {step===5&&cardResult&&<div className="enrollment-complete"><CheckCircle2 className="complete-mark"/><div className="step-intro"><span>Enrollment complete</span><h3>Member is ready</h3><p>The account, membership, payment, and NFC assignment were completed successfully.</p></div><ul className="completion-list"><li><CheckCircle2/>Member and account created</li><li><CheckCircle2/>Membership activated</li><li><CheckCircle2/>Cash payment recorded</li><li><CheckCircle2/>Credentials generated</li><li><CheckCircle2/>NFC card assigned</li></ul><div className="credential-box"><div><span>Card UID</span><strong>{cardResult.uid}</strong></div><div><span>Write this URL to the NTAG215 card</span><strong className="break-all">{cardResult.portalUrl}</strong></div></div><p className="completion-note">Test both the R80C UID scan and the phone tap before handing the card to the member.</p><div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div></div>}
    {showDiscardConfirm&&<div className="discard-confirm-layer" role="presentation" onMouseDown={()=>setShowDiscardConfirm(false)}><div className="discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-membership-title" aria-describedby="discard-membership-copy" onMouseDown={(event)=>event.stopPropagation()}><span className="discard-kicker">Unsaved membership</span><h3 id="discard-membership-title">Discard your changes?</h3><p id="discard-membership-copy">The information entered in this membership has not been saved. If you leave now, it will be lost.</p><div className="discard-actions"><button type="button" className="button secondary" autoFocus onClick={()=>setShowDiscardConfirm(false)}>Keep editing</button><button type="button" className="button danger" onClick={onClose}>Discard changes</button></div></div></div>}
  </div></Modal>;
}

type PlanAction = { plan: Plan; kind: 'archive' | 'restore' | 'delete' };
type PlanView = 'table' | 'cards';
type PlanScope = 'active' | 'archived';
const planArchiveReasons = ['Replaced by an updated plan', 'Seasonal or promotional plan ended', 'Pricing structure changed', 'Plan is no longer offered'];
const manualAttendanceReasons = ['Member forgot their NFC card', 'NFC card is lost or damaged', 'NFC card has not been assigned yet', 'NFC reader is temporarily unavailable'];

function planEligibilityLabel(plan: Plan) {
  return plan.eligibility === 'ALL' ? 'Everyone' : plan.eligibility === 'STUDENT' ? 'Students' : 'Regular members';
}

function MembershipsPage({ viewerRole }: { viewerRole: AdminUser['role'] }) {
  const plans = useLoad(adminApi.plans);
  const [editing, setEditing] = useState<Plan | null | undefined>(undefined);
  const [action, setAction] = useState<PlanAction>();
  const [scope, setScope] = useState<PlanScope>('active');
  const [view, setView] = useState<PlanView>(() => localStorage.getItem('membership-plan-view') === 'cards' ? 'cards' : 'table');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { localStorage.setItem('membership-plan-view', view); }, [view]);
  const activePlans = plans.data?.items.filter((plan) => !plan.isArchived) ?? [];
  const archivedPlans = plans.data?.items.filter((plan) => plan.isArchived) ?? [];
  const visiblePlans = scope === 'active' ? activePlans : archivedPlans;

  const openAction = (plan: Plan, kind: PlanAction['kind']) => { setReason(''); setError(''); setAction({ plan, kind }); };
  const runAction = async () => {
    if (!action) return;
    setBusy(true); setError('');
    try {
      if (action.kind === 'archive') await adminApi.archivePlan(action.plan._id, reason);
      if (action.kind === 'restore') await adminApi.restorePlan(action.plan._id);
      if (action.kind === 'delete') await adminApi.deletePlan(action.plan._id);
      setAction(undefined); setReason(''); plans.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the membership plan.');
    } finally { setBusy(false); }
  };

  const actionsFor = (plan: Plan) => <div className="plan-icon-actions">
    {!plan.isArchived && <><button type="button" className="plan-icon-button edit" onClick={() => setEditing(plan)} aria-label={`Edit ${plan.name}`} title="Edit plan"><Pencil /><span className="sr-only">Edit plan</span></button><button type="button" className="plan-icon-button archive" onClick={() => openAction(plan, 'archive')} aria-label={`Archive ${plan.name}`} title="Archive plan"><Archive /><span className="sr-only">Archive plan</span></button></>}
    {plan.isArchived && <><button type="button" className="plan-icon-button restore" onClick={() => openAction(plan, 'restore')} aria-label={`Restore ${plan.name}`} title="Restore plan"><RotateCcw /><span className="sr-only">Restore plan</span></button><button type="button" className="plan-icon-button delete" onClick={() => openAction(plan, 'delete')} aria-label={`Delete ${plan.name}`} title={viewerRole !== 'OWNER' ? 'Only the gym owner can delete plans' : plan.canDelete ? 'Delete plan permanently' : 'Cannot delete a plan with membership history'} disabled={viewerRole !== 'OWNER' || !plan.canDelete}><Trash2 /><span className="sr-only">Delete plan permanently</span></button></>}
  </div>;

  return <>
    <PageHeader title="Membership Management" subtitle="Create, organize and preserve membership plans without losing historical records." icon={<WalletCards />} action={<button className="button primary" onClick={() => setEditing(null)}>New plan</button>} />
    {error && !action && <div className="form-error">{error}</div>}
    <div className="plans-toolbar" aria-label="Membership plan display controls">
      <div className="plan-scope-tabs"><button type="button" className={scope === 'active' ? 'active' : ''} onClick={() => setScope('active')}>Current <span>{activePlans.length}</span></button><button type="button" className={scope === 'archived' ? 'active' : ''} onClick={() => setScope('archived')}>Archived <span>{archivedPlans.length}</span></button></div>
      <div className="plan-view-switch" aria-label="Choose plan layout"><button type="button" className={view === 'table' ? 'active' : ''} onClick={() => setView('table')} aria-pressed={view === 'table'}><Table2 />Table</button><button type="button" className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')} aria-pressed={view === 'cards'}><LayoutGrid />Cards</button></div>
    </div>
    {plans.loading || plans.error ? <Panel><ConnectionState {...plans} reload={plans.reload} empty="No membership plans yet" /></Panel> : visiblePlans.length === 0 ? <Panel><div className="state"><WalletCards /><strong>{scope === 'active' ? 'No current plans' : 'Archive is empty'}</strong><span>{scope === 'active' ? 'Create a membership plan to start accepting enrollments.' : 'Archived plans will appear here with their reason and history.'}</span></div></Panel> : view === 'table' ? <Panel className="plans-panel"><div className="table-wrap"><table className="plans-table"><thead><tr><th>Plan</th><th>Price</th><th>Duration</th><th>Eligibility</th><th className="plan-badge-heading">Type</th><th className="plan-badge-heading">Status</th><th className="plan-actions-heading"><span className="sr-only">Actions</span></th></tr></thead><tbody>{visiblePlans.map((plan) => <tr key={plan._id}><td><strong>{plan.name}</strong>{plan.isArchived && <small className="plan-archive-note">{plan.archiveReason}</small>}</td><td>₱{plan.price.toLocaleString()}</td><td>{plan.durationDays} days</td><td>{planEligibilityLabel(plan)}</td><td className="plan-badge-cell"><span className={`plan-type ${plan.isPromo ? 'promo' : 'standard'}`}>{plan.isPromo ? 'Promo' : 'Standard'}</span></td><td className="plan-badge-cell"><span className={`plan-state ${plan.isArchived ? 'archived' : 'active'}`}>{plan.isArchived ? 'Archived' : 'Active'}</span></td><td className="plan-actions-cell">{actionsFor(plan)}</td></tr>)}</tbody></table></div></Panel> : <div className="plan-card-grid">{visiblePlans.map((plan) => <article className={`plan-card ${plan.isArchived ? 'archived' : ''}`} key={plan._id}><header><div><span className={`plan-type ${plan.isPromo ? 'promo' : 'standard'}`}>{plan.isPromo ? 'Promo' : 'Standard'}</span><h2>{plan.name}</h2></div><span className={`plan-state ${plan.isArchived ? 'archived' : 'active'}`}>{plan.isArchived ? 'Archived' : 'Active'}</span></header><strong className="plan-card-price"><small>₱</small>{plan.price.toLocaleString()}</strong><div className="plan-card-details"><span><small>Duration</small><strong>{plan.durationDays} days</strong></span><span><small>Eligibility</small><strong>{planEligibilityLabel(plan)}</strong></span><span><small>Memberships</small><strong>{plan.usageCount}</strong></span></div>{plan.isArchived && <div className="plan-archive-reason"><small>Archive reason</small><p>{plan.archiveReason}</p>{plan.archivedAt && <time>{new Date(plan.archivedAt).toLocaleDateString()}</time>}</div>}<footer>{actionsFor(plan)}</footer></article>)}</div>}
    {editing !== undefined && <PlanModal plan={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); plans.reload(); }} />}
    {action?.kind === 'archive' && <Modal title="Archive membership plan?" onClose={() => setAction(undefined)}><p><strong>{action.plan.name}</strong> will no longer be offered for new enrollments or renewals. Existing member records remain unchanged.</p><label className="archive-reason-field">Reason for archiving<ReasonSelect options={planArchiveReasons} placeholder="Choose why this plan is being archived" otherPlaceholder="Enter the archive reason" onResolvedChange={setReason} /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setAction(undefined)}>Cancel</button><button className="button danger" disabled={busy || reason.trim().length < 3} onClick={runAction}>{busy ? 'Archiving…' : 'Archive plan'}</button></div></Modal>}
    {action?.kind === 'restore' && <Modal title="Restore membership plan?" onClose={() => setAction(undefined)}><p><strong>{action.plan.name}</strong> will return to the current plans and become available for enrollment and renewal.</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setAction(undefined)}>Cancel</button><button className="button primary" disabled={busy} onClick={runAction}>{busy ? 'Restoring…' : 'Restore plan'}</button></div></Modal>}
    {action?.kind === 'delete' && <Modal title="Delete this plan permanently?" onClose={() => setAction(undefined)}><p><strong>{action.plan.name}</strong> has never been used and can be permanently deleted. This action cannot be undone.</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setAction(undefined)}>Cancel</button><button className="button danger" disabled={busy} onClick={runAction}>{busy ? 'Deleting…' : 'Delete permanently'}</button></div></Modal>}
  </>;
}
function PlanModal({plan,onClose,onSaved}:{plan:Plan|null;onClose:()=>void;onSaved:()=>void}){const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[eligibility,setEligibility]=useState<PlanEligibility>(plan?.eligibility??'ALL');const[isPromo,setIsPromo]=useState(plan?.isPromo??false);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);const d=new FormData(e.currentTarget);const input={name:String(d.get('name')),price:Number(d.get('price')),durationDays:Number(d.get('durationDays')),eligibility,isPromo};try{if(plan)await adminApi.updatePlan(plan._id,input);else await adminApi.createPlan(input);onSaved()}catch(c){setError(c instanceof Error?c.message:'Could not save plan')}finally{setBusy(false)}};return <Modal title={plan?'Edit membership plan':'Create membership plan'} onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Plan name<input name="name" placeholder="e.g. 3-Month Student Promo" defaultValue={plan?.name} required/></label><label>Price (₱)<input name="price" type="number" min="0" step="0.01" placeholder="Enter plan price" inputMode="decimal" defaultValue={plan?.price} required/></label><label>Duration (days)<input name="durationDays" type="number" min="1" placeholder="Enter number of days" inputMode="numeric" defaultValue={plan?.durationDays} required/></label><label className="full-row">Who can use this plan?<PremiumSelect value={eligibility} onChange={(value)=>setEligibility(value as PlanEligibility)} placeholder="Choose plan eligibility" options={[{value:'ALL',label:'Everyone'},{value:'STUDENT',label:'Students only'},{value:'REGULAR',label:'Regular members only'}]}/></label><label className="full-row verification-check"><input type="checkbox" checked={isPromo} onChange={(event)=>setIsPromo(event.target.checked)}/><span><strong>Promotional plan</strong><small>This promo remains available until an administrator archives the plan.</small></span></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':plan?'Save plan':'Create plan'}</button></div></form></Modal>}

function AttendancePage() {
  const [filters, setFilters] = useState({ search: '', personType: '', status: '', from: '', to: '' });
  const [submitted, setSubmitted] = useState(filters); const [page, setPage] = useState(1);
  const records = useLoad(() => adminApi.attendance({ ...submitted, page, limit: 25 }));
  const [mode, setMode] = useState(false);
  const [manual, setManual] = useState(false);
  const [uid, setUid] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode) input.current?.focus(); }, [mode]);
  const scan = async (event: FormEvent) => { event.preventDefault(); if (!uid.trim() || busy) return; setBusy(true); try { const result = await adminApi.recordAttendance(uid.trim()); setMessage(result.message); setUid(''); records.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Scan failed'); } finally { setBusy(false); input.current?.focus(); } };
  const changePage = (next: number) => { setPage(next); records.reload(); };
  return <><PageHeader title="NFC Attendance" subtitle="The first daily scan checks in; the next scan checks out. Manual attendance is the accountable fallback." icon={<ScanLine />} action={<div className="header-actions"><button className="button secondary" onClick={() => setManual(true)}><UserCheck />Manual check in/out</button><button className={`button ${mode ? 'danger' : 'primary'}`} onClick={() => { setMode(!mode); setMessage(''); }}>{mode ? 'Stop attendance mode' : 'Start attendance mode'}</button></div>} />
    <Panel className={mode ? 'scanner active' : 'scanner'}><div><span className="eyebrow">R80C USB READER</span><h3>{mode ? 'Ready for a card' : 'Scanner is locked'}</h3><p>{mode ? 'Tap the NTAG215 card on the reader. Keep this window active.' : 'Start Attendance Mode before accepting any card input.'}</p></div><form onSubmit={scan}><input ref={input} value={uid} onChange={(e) => setUid(e.target.value)} disabled={!mode} autoComplete="off" aria-label="Card UID" placeholder="Card UID appears here" /><button className="button primary" disabled={!mode || busy}>Process</button></form>{message && <div className="scan-result">{message}</div>}</Panel>
    <Panel className="attendance-filter-panel"><form className="attendance-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(filters); records.reload(); }}><label className="search"><Search /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search name or reference" /></label><PremiumSelect value={filters.personType} onChange={(personType) => setFilters({ ...filters, personType })} placeholder="All people" options={[{ value: '', label: 'All people' }, { value: 'MEMBER', label: 'Members' }, { value: 'COACH', label: 'Coaches' }]} /><PremiumSelect value={filters.status} onChange={(status) => setFilters({ ...filters, status })} placeholder="All sessions" options={[{ value: '', label: 'All sessions' }, { value: 'CHECKED_IN', label: 'Currently checked in' }, { value: 'CHECKED_OUT', label: 'Completed sessions' }, { value: 'ACCEPTED', label: 'NFC member records' }, { value: 'MANUAL', label: 'Manual member records' }]} /><PremiumDatePicker value={filters.from} onChange={(from) => setFilters({ ...filters, from })} placeholder="From date" /><PremiumDatePicker value={filters.to} onChange={(to) => setFilters({ ...filters, to })} placeholder="To date" /><button className="button secondary">Apply</button></form></Panel>
    <Panel><div className="panel-title"><h3>Attendance records</h3></div>{records.data?.items.length ? <><AttendanceTable items={records.data.items} /><div className="pagination"><span>{records.data.total} records · Page {records.data.page} of {records.data.pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><button className="button secondary" disabled={page >= records.data.pages} onClick={() => changePage(page + 1)}>Next</button></div></div></> : <ConnectionState {...records} reload={records.reload} empty="No attendance records match these filters" />}</Panel>
    {manual&&<ManualAttendanceModal onClose={()=>setManual(false)} onSaved={(confirmation)=>{setManual(false);setMessage(confirmation);records.reload()}}/>}
  </>;
}
function AttendanceTable({ items }: { items: AttendanceRecord[] }) { const time = (value?: string) => value ? new Date(value).toLocaleString() : '—'; return <div className="table-wrap"><table className="attendance-table"><thead><tr><th>Person</th><th>Reference</th><th>Type</th><th>Status</th><th>Method</th><th>Check in</th><th>Check out</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><strong>{row.personName}</strong>{row.reason && <small>{row.reason}</small>}</td><td>{row.personNumber}</td><td><span className="status">{row.personType}</span></td><td><span className={`record-state ${row.status === 'CHECKED IN' ? 'active' : ''}`}>{row.status}</span></td><td>{row.method}</td><td>{time(row.checkedInAt)}</td><td>{row.status === 'VISIT RECORDED' ? 'Not tracked' : row.checkedOutAt ? time(row.checkedOutAt) : <span className="attendance-open">Currently inside</span>}</td></tr>)}</tbody></table></div>; }

function ManualAttendanceModal({onClose,onSaved}:{onClose:()=>void;onSaved:(message:string)=>void}){
  const members=useLoad(()=>adminApi.members()); const[error,setError]=useState(''); const[busy,setBusy]=useState(false);
  const eligible=members.data?.items.filter(member=>member.status==='ACTIVE')??[];
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{const result=await adminApi.recordManualAttendance(String(data.get('memberId')),String(data.get('reason')));onSaved(result.message)}catch(cause){setError(cause instanceof Error?cause.message:'Could not record manual attendance.')}finally{setBusy(false)}};
  return <Modal title="Manual check in or check out" onClose={onClose}><form className="form-grid" onSubmit={submit}><div className="notice full-row"><ShieldCheck />For the selected member, the first action today checks in and the second checks out. The administrator and reason are written to the audit trail.</div><label className="full-row">Active member<PremiumSelect name="memberId" required placeholder="Choose an active member" options={eligible.map(member=>({value:member.id,label:`${member.fullName} · ${member.memberNumber}${member.membership?.plan ? ` · ${member.membership.plan}` : ''}`}))}/></label><label className="full-row">Reason<ReasonSelect options={manualAttendanceReasons} placeholder="Choose why attendance is being entered manually" otherPlaceholder="Enter the manual attendance reason" placement="up" /></label>{members.loading&&<p className="muted full-row">Loading active members…</p>}{!members.loading&&!members.error&&!eligible.length&&<div className="form-error full-row">No active member accounts are available.</div>}{members.error&&<div className="form-error full-row">{members.error}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||members.loading||!eligible.length}>{busy?'Recording…':'Process attendance'}</button></div></form></Modal>;
}

function CardsPage() {
  const result = useLoad(adminApi.cards);
  const [show, setShow] = useState(false);
  const items = result.data?.items ?? [];
  return <>
    <PageHeader title="NFC Card Management" subtitle="Assign, verify, revoke and replace physical member and coach cards." icon={<IdCard />} action={<button className="button primary" onClick={() => setShow(true)}><IdCard />Assign NFC card</button>} />
    <div className="notice"><ShieldCheck />Cards can be assigned to members or coaches. Card UIDs and portal tokens are identifiers, never passwords.</div>
    {items.length ? <div className="nfc-card-grid">{items.map((card) => <article className="nfc-card-item" key={card.id}>
      <header><span className="nfc-card-icon"><IdCard /></span><span className={`record-state ${card.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{card.status}</span></header>
      <div className="nfc-card-owner"><small>Assigned to</small><h2>{card.assigneeName ?? 'Unassigned card'}</h2><span>{card.assigneeType === 'COACH' ? 'Coach access card' : 'Member access card'}</span></div>
      <footer><div><small>Card UID</small><code>{card.uid}</code></div><span className="nfc-card-type">{card.assigneeType}</span></footer>
    </article>)}</div> : <Panel><ConnectionState {...result} reload={result.reload} empty="No NFC cards registered" /></Panel>}
    {show && <CardModal onClose={() => setShow(false)} onSaved={() => { setShow(false); result.reload(); }} />}
  </>;
}
function CardModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const members=useLoad(()=>adminApi.members()); const coaches=useLoad(adminApi.coaches); const[type,setType]=useState<'MEMBER'|'COACH'>('MEMBER'); const[error,setError]=useState(''); const[busy,setBusy]=useState(false); const[created,setCreated]=useState<{uid:string;portalUrl?:string;type:'MEMBER'|'COACH'}|null>(null);
  const availableMembers=(members.data?.items??[]).filter(member=>member.cardStatus!=='ACTIVE'); const availableCoaches=(coaches.data?.items??[]).filter(coach=>coach.status==='ACTIVE'&&!coach.nfcCard);
  const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);setError('');const d=new FormData(e.currentTarget);try{const uid=String(d.get('uid'));if(type==='MEMBER'){const result=await adminApi.assignCard(String(d.get('personId')),uid);setCreated({uid:result.uid,portalUrl:result.portalUrl,type})}else{const result=await adminApi.assignCoachCard(String(d.get('personId')),uid);setCreated({uid:result.uid,type})}}catch(c){setError(c instanceof Error?c.message:'Card assignment failed')}finally{setBusy(false)}};
  if(created)return <Modal title="Card assigned" onClose={onSaved}><div className="credential-box account-credential-box"><div><span>Card holder:</span><strong>{created.type==='MEMBER'?'Member':'Coach'}</strong></div><div><span>Card UID:</span><strong>{created.uid}</strong></div>{created.portalUrl&&<div><span>Portal URL:</span><strong className="break-all">{created.portalUrl}</strong></div>}</div><p>{created.type==='MEMBER'?'Write the portal URL to the NTAG215 card now, then test both the R80C UID scan and phone tap. This URL will not be shown again.':'This coach card is ready for attendance. The first daily scan checks in and the next valid scan checks out.'}</p><div className="modal-actions"><button className="button primary" onClick={onSaved}>{created.type==='MEMBER'?'Verified and saved':'Done'}</button></div></Modal>;
  const options=type==='MEMBER'?availableMembers.map(person=>({value:person.id,label:`${person.fullName} · ${person.memberNumber}`})):availableCoaches.map(person=>({value:person.id,label:`${person.fullName} · ${person.coachNumber}`})); const loading=type==='MEMBER'?members.loading:coaches.loading; const loadError=type==='MEMBER'?members.error:coaches.error;
  return <Modal title="Assign NFC card" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Card holder type<PremiumSelect value={type} onChange={(value)=>{setType(value as 'MEMBER'|'COACH');setError('')}} placeholder="Choose card holder type" options={[{value:'MEMBER',label:'Member'},{value:'COACH',label:'Coach'}]} /></label><label className="full-row">{type==='MEMBER'?'Member':'Coach'}<PremiumSelect key={type} name="personId" required placeholder={`Choose a${type==='MEMBER'?' member':' coach'}`} options={options}/></label><div className="notice full-row"><IdCard />{type==='MEMBER'?'Member cards support attendance and the secure portal link.':'Coach cards are optional and are used for staff attendance only.'}</div><label className="full-row">Card UID<input name="uid" required autoFocus minLength={4} placeholder="Tap the card on the R80C reader"/></label>{loading&&<p className="muted full-row">Loading available {type==='MEMBER'?'members':'coaches'}…</p>}{!loading&&!loadError&&!options.length&&<div className="form-error full-row">No {type==='MEMBER'?'members':'coaches'} are currently available for card assignment.</div>}{loadError&&<div className="form-error full-row">{loadError}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||loading||!options.length}>{busy?'Assigning…':'Assign card'}</button></div></form></Modal>
}
function WalkInsPage() {
  const [query, setQuery] = useState(''); const [submitted, setSubmitted] = useState(''); const [page, setPage] = useState(1);
  const result = useLoad(() => adminApi.walkIns({ search: submitted, page, limit: 25 }));
  const settings = useLoad(adminApi.settings);
  const [showNew, setShowNew] = useState(false);
  const [returningGuest, setReturningGuest] = useState<WalkInProfile>();
  const previousGuests = result.data?.items ?? [];
  const closeModal = () => { setShowNew(false); setReturningGuest(undefined); };
  const saved = () => { closeModal(); result.reload(); };

  return <>
    <PageHeader title="Walk-in Management" subtitle="Record cash visits, recognize returning guests and preserve conversion history." icon={<UserPlus />} action={<button className="button primary" disabled={!settings.data} onClick={() => setShowNew(true)}><UserPlus />New walk-in</button>} />
    <div className="notice"><PhilippinePeso />The counter fee is {settings.data ? `₱${settings.data.defaultWalkInFee.toLocaleString()}` : 'loading from the API'}. Ordinary walk-ins do not receive permanent NFC cards.</div>
    {settings.error && <div className="form-error">Could not load the current walk-in fee. Refresh before recording a visit.</div>}
    <Panel className="walkin-search-panel">
      <form className="toolbar" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(query.trim()); result.reload(); }}><label className="search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search walk-ins by name, mobile number, or email" /></label><button className="button secondary">Search</button></form>
    </Panel>
    <Panel className="walkin-results-panel">
      {result.loading || result.error
        ? <ConnectionState {...result} reload={result.reload} empty="No walk-ins recorded" />
        : previousGuests.length
          ? <><div className="table-wrap"><table className="walkin-table"><thead><tr><th>Visitor</th><th>Contact</th><th>Visits</th><th>Last visit</th><th></th></tr></thead><tbody>{previousGuests.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.phone || item.email ? <><strong>{item.phone || 'No mobile number'}</strong><small>{item.email || 'No email address'}</small></> : <span className="muted">No contact saved</span>}</td><td>{item.visits}</td><td>{item.lastVisitAt ? new Date(item.lastVisitAt).toLocaleString() : 'Not recorded'}</td><td>{item.visitedToday ? <span className="walkin-recorded-today">Paid today</span> : <button className="button secondary walkin-return-button" disabled={!settings.data} onClick={() => setReturningGuest(item)}>Record return visit</button>}</td></tr>)}</tbody></table></div><div className="pagination"><span>{result.data!.total} profiles · Page {result.data!.page} of {result.data!.pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); result.reload(); }}>Previous</button><button className="button secondary" disabled={page >= result.data!.pages} onClick={() => { setPage(page + 1); result.reload(); }}>Next</button></div></div></>
          : <div className="state"><Search /><strong>{submitted ? 'No matching walk-in found' : 'No walk-ins recorded'}</strong><span>{submitted ? 'Check the name, mobile number, or email and try again.' : 'New walk-ins will appear here after their first recorded visit.'}</span></div>}
    </Panel>
    {showNew && settings.data && <WalkInModal fee={settings.data.defaultWalkInFee} onClose={closeModal} onSaved={saved} />}
    {returningGuest && settings.data && <WalkInModal profile={returningGuest} fee={settings.data.defaultWalkInFee} onClose={closeModal} onSaved={saved} />}
  </>;
}
function WalkInModal({profile,fee,onClose,onSaved}:{profile?:WalkInProfile;fee:number;onClose:()=>void;onSaved:()=>void}){
  const returning = Boolean(profile);
  const[step,setStep]=useState<1|2>(returning ? 2 : 1); const[firstName,setFirstName]=useState(''); const[lastName,setLastName]=useState(''); const[phone,setPhone]=useState(''); const[email,setEmail]=useState(''); const[amountReceived,setAmountReceived]=useState(''); const[notes,setNotes]=useState(''); const[error,setError]=useState(''); const[busy,setBusy]=useState(false); const[showDiscardConfirm,setShowDiscardConfirm]=useState(false);
  const received=Number(amountReceived||0); const change=received>=fee?received-fee:0; const dirty=Boolean(firstName||lastName||phone||email||amountReceived);
  const requestClose=()=>{if(dirty)setShowDiscardConfirm(true);else onClose()};
  const continueToPayment=(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(!phone){setError('Enter a mobile number so duplicate visits can be prevented.');return}setError('');setStep(2)};
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();if(received<fee){setError(`Cash received must be at least ₱${fee.toLocaleString()}.`);return}setBusy(true);setError('');try{await adminApi.recordWalkIn({firstName:returning?'Returning':firstName,lastName:returning?'Guest':lastName,phone:returning?undefined:phone.replace(/\s/g,'')||undefined,email:returning?undefined:email||undefined,profileId:profile?.id,amountReceived:received,notes:notes.trim()||undefined});onSaved()}catch(cause){setError(cause instanceof Error?cause.message:'Could not record walk-in')}finally{setBusy(false)}};
  return <Modal title={returning?'Record return visit':'New walk-in'} className="walkin-modal" onClose={requestClose}><div className="walkin-wizard"><ol className="walkin-progress"><li className={step===1?'current':'complete'}><span><UserRound/></span><small>Guest details</small></li><li className={step===2?'current':''}><span><PhilippinePeso/></span><small>Counter payment</small></li></ol>{step===1&&<form className="form-grid walkin-form" onSubmit={continueToPayment}><div className="step-intro full-row"><span>Step 1 of 2</span><h3>Guest information</h3><p>Create a reusable visitor profile for this first-time walk-in.</p></div><label>First name<input value={firstName} onChange={(event)=>setFirstName(capitalizeNameParts(event.target.value))} placeholder="Enter first name" autoComplete="given-name" autoCapitalize="words" required/></label><label>Last name<input value={lastName} onChange={(event)=>setLastName(capitalizeNameParts(event.target.value))} placeholder="Enter last name" autoComplete="family-name" autoCapitalize="words" required/></label><label>Mobile number<input value={phone} onChange={(event)=>setPhone(formatMobileNumber(event.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" autoComplete="tel" maxLength={13}/></label><label>Email address<input value={email} onChange={(event)=>setEmail(event.target.value)} type="email" placeholder="name@email.com" autoComplete="email"/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={requestClose}>Cancel</button><button className="button primary">Continue to payment</button></div></form>}{step===2&&<form className="form-grid walkin-form" onSubmit={submit}><div className="step-intro full-row"><span>{returning?'Returning walk-in':'Step 2 of 2'}</span><h3>Counter payment</h3><p>Confirm the visitor, receive the cash, and verify the change before recording the visit.</p></div>{returning&&<div className="walkin-returning-summary full-row"><span>Previous visitor</span><strong>{profile?.fullName}</strong><small>{profile?.visits} previous {profile?.visits===1?'visit':'visits'} · Last visit {profile?.lastVisitAt?new Date(profile.lastVisitAt).toLocaleDateString():'not recorded'}</small></div>}<section className="pos-panel full-row"><div className="pos-order"><span>Walk-in visit</span><strong>{profile?.fullName??`${firstName} ${lastName}`.trim()}</strong><dl><div><dt>Walk-in fee</dt><dd>₱{fee.toLocaleString()}</dd></div><div><dt>Payment method</dt><dd>Cash</dd></div></dl><div className="pos-total"><span>Total due</span><strong>₱{fee.toLocaleString()}</strong></div></div><div className="pos-tender"><label>Cash received<div className={`currency-input${amountReceived?' has-value':''}`}>{amountReceived&&<span aria-hidden="true">₱</span>}<input type="number" min={fee} step="0.01" placeholder="Enter cash received" inputMode="decimal" value={amountReceived} onChange={(event)=>{setAmountReceived(event.target.value);setError('')}} autoFocus required/></div></label><div className={`change-display ${amountReceived&&received>=fee?'ready':''}`}><span>Change</span><strong>{amountReceived&&received>=fee?`₱${change.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`:'—'}</strong><small>{amountReceived&&received<fee?`Still due: ₱${(fee-received).toLocaleString()}`:'Confirm this amount before recording the visit.'}</small></div></div></section><label className="full-row">Counter note (optional)<input value={notes} onChange={(event)=>setNotes(event.target.value)} placeholder="Add a short note about this visit" maxLength={500}/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');if(returning)requestClose();else setStep(1)}}>{returning?'Back to search':'Back'}</button><button className="button primary" disabled={busy||received<fee}>{busy?'Recording…':'Record payment and visit'}</button></div></form>}{showDiscardConfirm&&<div className="discard-confirm-layer" role="presentation" onMouseDown={()=>setShowDiscardConfirm(false)}><div className="discard-confirm" role="alertdialog" aria-modal="true" onMouseDown={(event)=>event.stopPropagation()}><span className="discard-kicker">Unsaved walk-in</span><h3>Discard this visit?</h3><p>The guest and payment information entered here has not been saved.</p><div className="discard-actions"><button type="button" className="button secondary" onClick={()=>setShowDiscardConfirm(false)}>Keep editing</button><button type="button" className="button danger" onClick={onClose}>Discard changes</button></div></div></div>}</div></Modal>
}
const COACH_SPECIALTIES = [
  'Strength training', 'Weight management', 'Bodybuilding', 'Functional fitness',
  'Conditioning', 'Mobility and flexibility', 'Beginner coaching', 'Personal training',
].map((label) => ({ value: label, label }));
const COACH_DAYS: Array<{ value: CoachDay; label: string }> = [
  { value: 'MONDAY', label: 'Monday' }, { value: 'TUESDAY', label: 'Tuesday' },
  { value: 'WEDNESDAY', label: 'Wednesday' }, { value: 'THURSDAY', label: 'Thursday' },
  { value: 'FRIDAY', label: 'Friday' }, { value: 'SATURDAY', label: 'Saturday' },
  { value: 'SUNDAY', label: 'Sunday' },
];
const dayName = (day: CoachDay) => COACH_DAYS.find((item) => item.value === day)?.label ?? day;
const coachTimeLabel = (value: string) => {
  const [hourText, minute = '00'] = value.split(':');
  const hour = Number(hourText);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? 'PM' : 'AM'}`;
};
type CoachSaveInput = { firstName: string; lastName: string; phone?: string; email?: string; specialties: string[]; availabilitySchedule: CoachAvailability[]; username?: string; isPublished: boolean };

function CoachEditor({ coach, viewerRole, busy, error, onClose, onSave, onAssignCard, onRevokeCard, onResetPassword, onStatusChange }: { coach: Coach | null; viewerRole: AdminUser['role']; busy: boolean; error: string; onClose: () => void; onSave: (input: CoachSaveInput) => Promise<void>; onAssignCard: (coach: Coach) => void; onRevokeCard: (coach: Coach) => void; onResetPassword: (coach: Coach) => void; onStatusChange: (coach: Coach) => void }) {
  const legacySpecialties = coach?.specialties?.length ? coach.specialties : String(coach?.specialty ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const knownSpecialties = legacySpecialties.filter((item) => COACH_SPECIALTIES.some((option) => option.value === item));
  const unknownSpecialties = legacySpecialties.filter((item) => !COACH_SPECIALTIES.some((option) => option.value === item));
  const initialSchedule = coach?.availabilitySchedule?.length ? coach.availabilitySchedule : [];
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [firstName, setFirstName] = useState(coach?.firstName ?? '');
  const [lastName, setLastName] = useState(coach?.lastName ?? '');
  const [phone, setPhone] = useState(coach?.phone ? formatMobileNumber(coach.phone) : '');
  const [email, setEmail] = useState(coach?.email ?? '');
  const [specialties, setSpecialties] = useState<string[]>([...knownSpecialties, ...(unknownSpecialties.length ? ['__OTHER__'] : [])]);
  const [otherSpecialty, setOtherSpecialty] = useState(unknownSpecialties.join(', '));
  const [selectedDays, setSelectedDays] = useState<string[]>(initialSchedule.map((entry) => entry.day));
  const [schedule, setSchedule] = useState<Record<string, { startTime: string; endTime: string }>>(() => Object.fromEntries(initialSchedule.map((entry) => [entry.day, { startTime: entry.startTime, endTime: entry.endTime }])));
  const [username, setUsername] = useState(coach?.account?.username ?? '');
  const [isPublished, setPublished] = useState(coach?.isPublished ?? true);
  const [localError, setLocalError] = useState('');
  const [discarding, setDiscarding] = useState(false);
  const dirty = Boolean(firstName || lastName || phone || email || specialties.length || selectedDays.length || (!coach && username));
  const requestClose = () => dirty ? setDiscarding(true) : onClose();
  const updateDays = (next: string[]) => {
    const valid = next.filter((item): item is CoachDay => COACH_DAYS.some((day) => day.value === item));
    setSelectedDays(valid);
    setSchedule((current) => {
      const updated = { ...current };
      valid.forEach((day) => { if (!updated[day]) updated[day] = { startTime: '09:00', endTime: '17:00' }; });
      return updated;
    });
  };
  const nextFromDetails = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setLocalError(''); setStep(2); };
  const nextFromSchedule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resolvedSpecialties = [...specialties.filter((item) => item !== '__OTHER__'), ...(specialties.includes('__OTHER__') && otherSpecialty.trim() ? [otherSpecialty.trim()] : [])];
    if (!resolvedSpecialties.length) return setLocalError('Choose at least one specialty.');
    if (!selectedDays.length) return setLocalError('Choose at least one available day.');
    if (selectedDays.some((day) => !schedule[day] || schedule[day].endTime <= schedule[day].startTime)) return setLocalError('Each end time must be later than its start time.');
    setLocalError(''); setStep(3);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const resolvedSpecialties = [...specialties.filter((item) => item !== '__OTHER__'), ...(specialties.includes('__OTHER__') && otherSpecialty.trim() ? [otherSpecialty.trim()] : [])];
    await onSave({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.replace(/\D/g, '') || undefined, email: email.trim() || undefined, specialties: resolvedSpecialties, availabilitySchedule: selectedDays.map((day) => ({ day: day as CoachDay, ...schedule[day] })), username: coach ? undefined : username.trim(), isPublished });
  };
  return <Modal title={coach ? 'Edit coach' : 'New coach'} className={`coach-editor-modal coach-editor-step-${step}`} onClose={requestClose}><div className="coach-wizard">
    <ol className="enrollment-progress coach-progress">
      <li className={step === 1 ? 'current' : 'complete'}><span><UserRound /></span><small>Coach details</small></li>
      <li className={step === 2 ? 'current' : step > 2 ? 'complete' : ''}><span><CalendarClock /></span><small>Specialties & availability</small></li>
      <li className={step === 3 ? 'current' : ''}><span><KeyRound /></span><small>Portal & visibility</small></li>
    </ol>
    {step === 1 && <form className="coach-step-form" onSubmit={nextFromDetails}><div className="coach-step-scroll"><div className="step-intro full-row"><span>Step 1 of 3</span><h3>Coach information</h3><p>Record the coach's identity and contact details.</p></div>
      <label>First name<input value={firstName} onChange={(event) => setFirstName(capitalizeNameParts(event.target.value))} placeholder="Enter first name" autoCapitalize="words" autoComplete="given-name" required /></label>
      <label>Last name<input value={lastName} onChange={(event) => setLastName(capitalizeNameParts(event.target.value))} placeholder="Enter last name" autoCapitalize="words" autoComplete="family-name" required /></label>
      <label>Mobile number<input value={phone} onChange={(event) => setPhone(formatMobileNumber(event.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" maxLength={13} autoComplete="tel" /></label>
      <label className="coach-email">Email address<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="name@email.com" autoComplete="email" /></label></div>
      <div className="coach-editor-actions full-row"><button type="button" className="button secondary" onClick={requestClose}>Cancel</button><button className="button primary">Continue</button></div>
    </form>}
    {step === 2 && <form className="coach-step-form coach-schedule-step" onSubmit={nextFromSchedule}><div className="coach-step-scroll"><div className="step-intro full-row"><span>Step 2 of 3</span><h3>Coaching schedule</h3><p>Choose every service offered and set the working hours for each available day.</p></div>
      <label className="full-row">Specialties<PremiumMultiSelect value={specialties} onChange={setSpecialties} options={COACH_SPECIALTIES} placeholder="Choose one or more specialties" otherLabel="Other specialty" otherValue={otherSpecialty} onOtherValueChange={setOtherSpecialty} /></label>
      <label className="full-row">Available days<PremiumMultiSelect value={selectedDays} onChange={updateDays} options={COACH_DAYS} placeholder="Choose available days" allowOther={false} /></label>
      <div className="coach-day-list full-row">{selectedDays.map((day) => <div className="coach-day-row" key={day}><strong>{dayName(day as CoachDay)}</strong><div><span>From</span><PremiumTimePicker label={`${dayName(day as CoachDay)} start time`} value={schedule[day]?.startTime ?? '09:00'} onChange={(startTime) => setSchedule((current) => ({ ...current, [day]: { startTime, endTime: current[day]?.endTime ?? '17:00' } }))} /></div><div><span>Until</span><PremiumTimePicker label={`${dayName(day as CoachDay)} end time`} value={schedule[day]?.endTime ?? '17:00'} onChange={(endTime) => setSchedule((current) => ({ ...current, [day]: { startTime: current[day]?.startTime ?? '09:00', endTime } }))} /></div></div>)}</div>
      {localError && <div className="form-error full-row">{localError}</div>}</div><div className="coach-editor-actions full-row"><button type="button" className="button secondary" onClick={() => { setLocalError(''); setStep(1); }}>Back</button><button className="button primary">Continue</button></div>
    </form>}
    {step === 3 && <form className="coach-step-form coach-portal-step" onSubmit={submit}><div className="coach-step-scroll"><div className="step-intro full-row"><span>Step 3 of 3</span><h3>Portal access</h3><p>{coach ? 'Review the coach account and member-facing visibility.' : 'Create the coach login and choose whether members can see this profile.'}</p></div>
      <label className="full-row">Portal username<input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} placeholder="Create a coach username" autoComplete="off" minLength={3} disabled={Boolean(coach)} required /></label>
      <button type="button" role="switch" aria-checked={isPublished} className={`coach-visibility-toggle full-row ${isPublished ? 'active' : ''}`} onClick={() => setPublished((current) => !current)}><span aria-hidden="true"><i /></span><div><strong>Show this coach to members</strong><small>{isPublished ? 'Visible in the member portal coach directory.' : 'Hidden from members until enabled.'}</small></div></button>
      <div className="coach-review full-row"><div><span>Coach</span><strong>{firstName} {lastName}</strong></div><div><span>Specialties</span><strong>{[...specialties.filter((item) => item !== '__OTHER__'), ...(otherSpecialty.trim() ? [otherSpecialty.trim()] : [])].join(', ')}</strong></div><div><span>Working days</span><strong>{selectedDays.map((day) => dayName(day as CoachDay)).join(', ')}</strong></div></div>
      {coach && <div className="coach-management-grid full-row">
        <section><div className="coach-management-heading"><IdCard /><div><strong>NFC attendance card</strong><small>Optional. First daily scan checks in; the next scan checks out.</small></div></div>{coach.nfcCard ? <><p>Active card: <code>{coach.nfcCard.uid}</code></p><button type="button" className="button secondary" onClick={() => onRevokeCard(coach)}><UserX />Remove card</button></> : <><p>No NFC card assigned.</p><button type="button" className="button secondary" disabled={coach.status !== 'ACTIVE'} onClick={() => onAssignCard(coach)}><IdCard />Assign NFC card</button></>}</section>
        <section className="coach-account-security"><div className="coach-management-heading"><KeyRound /><div><strong>Account &amp; security</strong><small>Sensitive actions are restricted to the gym owner.</small></div></div>{viewerRole === 'OWNER' ? <div className="coach-security-actions"><button type="button" className="button secondary" onClick={() => onResetPassword(coach)}><KeyRound />Reset password</button><button type="button" className={`button ${coach.status === 'ACTIVE' ? 'danger' : 'secondary'}`} onClick={() => onStatusChange(coach)}>{coach.status === 'ACTIVE' ? <UserX /> : <UserCheck />}{coach.status === 'ACTIVE' ? 'Disable account' : 'Enable account'}</button></div> : <p>Only the gym owner can reset passwords or change account access.</p>}</section>
      </div>}
      {(localError || error) && <div className="form-error full-row">{localError || error}</div>}</div><div className="coach-editor-actions full-row"><button type="button" className="button secondary" onClick={() => setStep(2)}>Back</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : coach ? 'Save coach' : 'Create coach and account'}</button></div>
    </form>}
    {discarding && <div className="discard-confirm-layer" onMouseDown={() => setDiscarding(false)}><div className="discard-confirm" role="alertdialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><span className="discard-kicker">Unsaved coach</span><h3>Discard these changes?</h3><p>The coach information entered in this form has not been saved.</p><div className="discard-actions"><button className="button secondary" type="button" onClick={() => setDiscarding(false)}>Keep editing</button><button className="button danger" type="button" onClick={onClose}>Discard changes</button></div></div></div>}
  </div></Modal>;
}

function CoachesPage({ viewerRole }: { viewerRole: AdminUser['role'] }) {
  const result = useLoad(adminApi.coaches);
  const [editing, setEditing] = useState<Coach | null | undefined>(undefined);
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string }>();
  const [statusCoach, setStatusCoach] = useState<Coach>();
  const [resetCoach, setResetCoach] = useState<Coach>();
  const [assignCardCoach, setAssignCardCoach] = useState<Coach>();
  const [revokeCardCoach, setRevokeCardCoach] = useState<Coach>();
  const [selectedCoach, setSelectedCoach] = useState<Coach>();
  const [attendanceCoach, setAttendanceCoach] = useState<Coach>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const perform = async (task: () => Promise<unknown>) => { setBusy(true); setError(''); try { await task(); result.reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The coach record could not be updated.'); throw cause; } finally { setBusy(false); } };
  const save = async (input: CoachSaveInput) => {
    setBusy(true); setError('');
    try {
      if (editing) await adminApi.updateCoach(editing.id, input);
      else { const created = await adminApi.createCoach({ ...input, username: input.username! }); setCredentials({ username: created.account?.username ?? input.username!, temporaryPassword: created.temporaryPassword }); }
      setEditing(undefined); result.reload();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The coach record could not be saved.'); }
    finally { setBusy(false); }
  };
  const attendance = async (coach: Coach, reason: string) => { try { await perform(() => coach.attendanceToday && !coach.attendanceToday.checkedOutAt ? adminApi.checkOutCoach(coach.id, reason) : adminApi.checkInCoach(coach.id, reason)); setEditing(undefined); setAttendanceCoach(undefined); setSelectedCoach(undefined); } catch { /* handled */ } };
  return <><PageHeader title="Coach Management" subtitle="Manage coach profiles, portal access, availability and daily staff attendance." icon={<Dumbbell />} action={<button className="button primary" onClick={() => { setError(''); setEditing(null); }}><UserPlus />New coach</button>} />
    <div className="coach-directory-panel">{result.data?.items.length ? <div className="coach-card-grid">{result.data.items.map((coach) => {
      const specialties = coach.specialties?.length ? coach.specialties : String(coach.specialty ?? '').split(',').map((item) => item.trim()).filter(Boolean);
      const checkedInAt = coach.attendanceToday ? new Date(coach.attendanceToday.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const checkedOutAt = coach.attendanceToday?.checkedOutAt ? new Date(coach.attendanceToday.checkedOutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
      const specialtyLabel = specialties.length ? `${specialties[0]}${specialties.length > 1 ? ` +${specialties.length - 1}` : ''}` : 'No specialty added';
      const attendanceLabel = coach.attendanceToday ? checkedOutAt ? `Completed · ${checkedOutAt}` : `Checked in · ${checkedInAt}` : 'Not checked in';
      return <button type="button" className={`coach-summary-card ${coach.status === 'ACTIVE' ? '' : 'inactive'}`} key={coach.id} onClick={() => setSelectedCoach(coach)}>
        <span className="coach-summary-avatar" aria-hidden="true"><UserRound /></span>
        <span className="coach-summary-main"><strong>{coach.fullName}</strong><small>{coach.coachNumber}</small></span>
        <span className={`record-state ${coach.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{coach.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
        <span className="coach-summary-facts"><span><Dumbbell /><small>Specialty</small><strong>{specialtyLabel}</strong></span><span><CalendarClock /><small>Availability</small><strong>{coach.availabilitySchedule?.length ? `${coach.availabilitySchedule.length} days weekly` : 'No schedule'}</strong></span><span><UserCheck /><small>Today</small><strong>{attendanceLabel}</strong></span></span>
        <span className="coach-summary-open"><Eye />View profile</span>
      </button>;
    })}</div> : <ConnectionState {...result} reload={result.reload} empty="No coaches added yet" />}</div>
    {selectedCoach && <CoachDetailsModal coach={selectedCoach} busy={busy} onClose={() => setSelectedCoach(undefined)} onEdit={() => { setError(''); setSelectedCoach(undefined); setEditing(selectedCoach); }} onAttendance={() => setAttendanceCoach(selectedCoach)} />}
    {attendanceCoach && <CoachAttendanceModal coach={attendanceCoach} busy={busy} error={error} onClose={() => setAttendanceCoach(undefined)} onConfirm={(reason) => attendance(attendanceCoach, reason)} />}
    {editing !== undefined && <CoachEditor coach={editing} viewerRole={viewerRole} busy={busy} error={error} onClose={() => setEditing(undefined)} onSave={save} onAssignCard={setAssignCardCoach} onRevokeCard={setRevokeCardCoach} onResetPassword={(coach) => { setError(''); setResetCoach(coach); }} onStatusChange={(coach) => { setError(''); setStatusCoach(coach); }} />}
    {credentials && <Modal title="Coach account created" onClose={() => setCredentials(undefined)}><p>Give these one-time credentials directly to the coach. They must create a private password on first sign-in.</p><div className="credential-box account-credential-box"><div><span>Username:</span><strong>{credentials.username}</strong></div><div><span>Temporary password:</span><strong>{credentials.temporaryPassword}</strong></div></div><div className="modal-actions"><button className="button primary" onClick={() => setCredentials(undefined)}>Done</button></div></Modal>}
    {statusCoach && <Modal title={`${statusCoach.status === 'ACTIVE' ? 'Disable' : 'Enable'} coach?`} onClose={() => setStatusCoach(undefined)}><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); try { await perform(() => adminApi.setCoachStatus(statusCoach.id, statusCoach.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE', reason)); setStatusCoach(undefined); setEditing(undefined); } catch { /* handled */ } }}><p className="full-row">{statusCoach.status === 'ACTIVE' ? 'Portal access will be blocked and the coach will be hidden from members. Attendance history stays intact.' : 'Portal access and the published coach profile will be restored.'}</p><label className="full-row">Reason<ReasonSelect options={statusCoach.status === 'ACTIVE' ? ['No longer affiliated with the gym', 'Temporarily unavailable', 'Account access suspended'] : ['Returned to active coaching', 'Availability resumed', 'Account access restored']} placeholder="Choose a reason" /></label>{error && <div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={() => setStatusCoach(undefined)}>Cancel</button><button className={`button ${statusCoach.status === 'ACTIVE' ? 'danger' : 'primary'}`} disabled={busy}>{statusCoach.status === 'ACTIVE' ? 'Disable coach' : 'Enable coach'}</button></div></form></Modal>}
    {resetCoach && <Modal title="Reset coach password?" onClose={() => setResetCoach(undefined)}><p>This signs the coach out everywhere and generates a new temporary password.</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setResetCoach(undefined)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { const next = await adminApi.resetCoachPassword(resetCoach.id); setResetCoach(undefined); setEditing(undefined); setCredentials(next); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The temporary password could not be generated.'); } finally { setBusy(false); } }}>{busy ? 'Resetting…' : 'Reset password'}</button></div></Modal>}
    {assignCardCoach && <CoachCardModal coach={assignCardCoach} onClose={() => setAssignCardCoach(undefined)} onSaved={() => { setAssignCardCoach(undefined); setEditing(undefined); result.reload(); }} />}
    {revokeCardCoach?.nfcCard && <Modal title="Remove coach NFC card?" onClose={() => setRevokeCardCoach(undefined)}><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); setBusy(true); setError(''); try { const reason = String(new FormData(event.currentTarget).get('reason')); await adminApi.revokeCard(revokeCardCoach.nfcCard!.id, reason); setRevokeCardCoach(undefined); setEditing(undefined); result.reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The NFC card could not be removed.'); } finally { setBusy(false); } }}><div className="notice full-row"><IdCard />Card <strong>{revokeCardCoach.nfcCard.uid}</strong> will stop recording attendance immediately.</div><label className="full-row">Reason<ReasonSelect options={['Card returned', 'Card lost or damaged', 'Coach no longer needs an NFC card']} placeholder="Choose why the card is being removed" otherPlaceholder="Enter the reason" placement="up" /></label>{error && <div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={() => setRevokeCardCoach(undefined)}>Cancel</button><button className="button danger" disabled={busy}>{busy ? 'Removing…' : 'Remove card'}</button></div></form></Modal>}
  </>;
}

function CoachDetailsModal({ coach, busy, onClose, onEdit, onAttendance }: { coach: Coach; busy: boolean; onClose: () => void; onEdit: () => void; onAttendance: () => void }) {
  const specialties = coach.specialties?.length ? coach.specialties : String(coach.specialty ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  const checkedInAt = coach.attendanceToday ? new Date(coach.attendanceToday.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const checkedOutAt = coach.attendanceToday?.checkedOutAt ? new Date(coach.attendanceToday.checkedOutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const attendanceComplete = Boolean(coach.attendanceToday?.checkedOutAt);
  return <Modal title="Coach profile" className="coach-details-modal" onClose={onClose}>
    <header className="coach-details-hero"><span><UserRound /></span><div><h3>{coach.fullName}</h3><p><IdCard />{coach.coachNumber}</p></div><span className={`record-state ${coach.status === 'ACTIVE' ? 'active' : 'inactive'}`}>{coach.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span></header>
    <div className="coach-details-grid">
      <section><div className="coach-card-section-title"><Dumbbell /><span>Specialties</span></div><div className="coach-specialty-list">{specialties.length ? specialties.map((specialty) => <span key={specialty}>{specialty}</span>) : <p>None added</p>}</div></section>
      <section><div className="coach-card-section-title"><KeyRound /><span>Portal account</span></div><strong>@{coach.account?.username ?? 'No account'}</strong><small>{coach.status === 'ACTIVE' ? 'Portal access enabled' : 'Portal access disabled'}</small></section>
      <section><div className="coach-card-section-title"><UserCheck /><span>Attendance today</span></div><strong>{coach.attendanceToday ? `Checked in at ${checkedInAt}` : 'Not checked in'}</strong><small>{checkedOutAt ? `Checked out at ${checkedOutAt}` : coach.attendanceToday ? 'Currently inside the gym' : 'No attendance recorded today'}</small></section>
      <section><div className="coach-card-section-title"><IdCard /><span>NFC attendance</span></div><strong>{coach.nfcCard ? 'Card assigned' : 'No card assigned'}</strong><small>{coach.nfcCard?.uid ?? 'Optional for coach attendance'}</small></section>
    </div>
    <section className="coach-details-schedule"><div className="coach-card-section-title"><CalendarClock /><span>Weekly availability</span></div><div className="coach-full-schedule">{coach.availabilitySchedule.length ? coach.availabilitySchedule.map((entry) => <div className="coach-full-schedule-day" key={entry.day}><span><CalendarClock /><strong>{dayName(entry.day)}</strong></span><div><time>{coachTimeLabel(entry.startTime)}</time><i>to</i><time>{coachTimeLabel(entry.endTime)}</time></div></div>) : <div className="coach-schedule-empty">No availability schedule has been added.</div>}</div></section>
    <CoachAttendanceHistory coachId={coach.id} />
    <div className="modal-actions coach-details-actions"><button className="button secondary" onClick={onClose}>Close</button><button className="button secondary" disabled={busy || coach.status !== 'ACTIVE' || attendanceComplete} onClick={onAttendance}><UserCheck />{attendanceComplete ? 'Attendance completed' : coach.attendanceToday ? 'Manual check out' : 'Manual check in'}</button><button className="button primary" onClick={onEdit}><Pencil />Edit coach</button></div>
  </Modal>;
}

function CoachAttendanceHistory({ coachId }: { coachId: string }) {
  const [page, setPage] = useState(1); const result = useLoad(() => adminApi.coachAttendance(coachId, page));
  const changePage = (next: number) => { setPage(next); result.reload(); };
  return <section className="coach-attendance-history"><div className="coach-card-section-title"><UserCheck /><span>Attendance history</span></div>{result.loading && !result.data ? <p>Loading attendance…</p> : result.error ? <p>{result.error}</p> : result.data?.items.length ? <><div>{result.data.items.map((item) => <article key={item.id}><time>{new Date(`${item.attendanceDate}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</time><span>{new Date(item.checkedInAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {item.checkedOutAt ? new Date(item.checkedOutAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Still checked in'}</span><small>{item.method}{item.reason ? ` · ${item.reason}` : ''}</small></article>)}</div>{result.data.pages > 1 && <div className="coach-history-pages"><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><span>{page} / {result.data.pages}</span><button type="button" disabled={page >= result.data.pages} onClick={() => changePage(page + 1)}>Next</button></div>}</> : <p>No coach attendance has been recorded.</p>}</section>;
}

function CoachAttendanceModal({ coach, busy, error, onClose, onConfirm }: { coach: Coach; busy: boolean; error: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const checkingOut = Boolean(coach.attendanceToday && !coach.attendanceToday.checkedOutAt);
  const [reason, setReason] = useState('');
  return <Modal title={`Manual ${checkingOut ? 'check out' : 'check in'}`} onClose={onClose}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); void onConfirm(reason); }}><div className="notice full-row"><ShieldCheck />This manual attendance action and its reason will be recorded in the audit trail.</div><label className="full-row">Coach<input value={coach.fullName} disabled /></label><label className="full-row">Reason<ReasonSelect options={checkingOut ? ['Coach is leaving the gym', 'NFC reader unavailable', 'Card was not available'] : ['Coach arrived without NFC card', 'NFC reader unavailable', 'Card was not available']} placeholder="Choose a reason" otherPlaceholder="Enter the attendance reason" placement="up" onResolvedChange={setReason} /></label>{error && <div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy || reason.trim().length < 3}>{busy ? 'Recording…' : checkingOut ? 'Check out coach' : 'Check in coach'}</button></div></form></Modal>;
}

function CoachCardModal({ coach, onClose, onSaved }: { coach: Coach; onClose: () => void; onSaved: () => void }) {
  const [uid, setUid] = useState('');
  const [created, setCreated] = useState<{ uid: string }>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); try { setCreated(await adminApi.assignCoachCard(coach.id, uid.trim())); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The NFC card could not be assigned.'); } finally { setBusy(false); } };
  if (created) return <Modal title="Coach NFC card assigned" onClose={onSaved}><div className="credential-box account-credential-box"><div><span>Coach:</span><strong>{coach.fullName}</strong></div><div><span>Card UID:</span><strong>{created.uid}</strong></div></div><p>The first scan each day checks the coach in. Their next scan checks them out.</p><div className="modal-actions"><button className="button primary" onClick={onSaved}>Done</button></div></Modal>;
  return <Modal title="Assign coach NFC card" onClose={onClose}><form className="form-grid" onSubmit={submit}><div className="notice full-row"><IdCard />This card is optional and records staff attendance only. It does not replace the coach's password.</div><label className="full-row">Coach<input value={coach.fullName} disabled /></label><label className="full-row">Card UID<input value={uid} onChange={(event) => setUid(event.target.value)} required autoFocus minLength={4} placeholder="Tap the card on the R80C reader" /></label>{error && <div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Assigning…' : 'Assign card'}</button></div></form></Modal>;
}
function PaymentsPage({ viewerRole }: { viewerRole: AdminUser['role'] }) {
  const [filters, setFilters] = useState({ search: '', type: '', status: '', from: '', to: '' });
  const [submitted, setSubmitted] = useState(filters); const [page, setPage] = useState(1);
  const result = useLoad(() => adminApi.payments({ ...submitted, page }));
  const [selected, setSelected] = useState<string>();
  const money = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const totals = <div className="payment-totals" aria-label="Cash collection summary"><div><span>Collected today</span><strong>{result.data ? money(result.data.summary.today) : '—'}</strong></div><div><span>This week</span><strong>{result.data ? money(result.data.summary.thisWeek) : '—'}</strong></div></div>;
  const changePage = (next: number) => { setPage(next); result.reload(); };
  return <>
    <PageHeader title="Cash Payments" subtitle="Authoritative over-the-counter transactions and receipt references." icon={<PhilippinePeso />} action={totals} />
    {viewerRole === 'OWNER' && <CashClosingPanel onChanged={result.reload} />}
    <Panel><form className="payment-filters" onSubmit={(event) => { event.preventDefault(); setPage(1); setSubmitted(filters); result.reload(); }}>
      <label className="search"><Search /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder="Search reference or payer" /></label>
      <PremiumSelect value={filters.type} onChange={(value) => setFilters({ ...filters, type: value })} options={[{ value: '', label: 'All payment types' }, { value: 'MEMBERSHIP', label: 'Membership' }, { value: 'WALK_IN', label: 'Walk-in' }, { value: 'CARD_REPLACEMENT', label: 'Card replacement' }]} placeholder="All payment types" />
      <PremiumSelect value={filters.status} onChange={(value) => setFilters({ ...filters, status: value })} options={[{ value: '', label: 'All statuses' }, { value: 'COMPLETED', label: 'Completed' }, { value: 'VOID', label: 'Void' }]} placeholder="All statuses" />
      <PremiumDatePicker value={filters.from} onChange={(from) => setFilters({ ...filters, from })} placeholder="From date" />
      <PremiumDatePicker value={filters.to} onChange={(to) => setFilters({ ...filters, to })} placeholder="To date" />
      <button className="button secondary">Apply</button>
    </form></Panel>
    <Panel>{result.data?.items.length ? <><div className="table-wrap"><table className="payment-table"><thead><tr><th>Reference</th><th>Payer</th><th>Type</th><th>Status</th><th>Amount</th><th>Received</th><th></th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td>{item.reference}</td><td>{item.payerName}</td><td>{item.type}</td><td><span className={`record-state ${item.status === 'COMPLETED' ? 'active' : 'cancelled'}`}>{item.status}</span></td><td>{money(item.amount)}</td><td>{new Date(item.receivedAt).toLocaleString()}</td><td><button className="button secondary compact" onClick={() => setSelected(item.id)}>View receipt</button></td></tr>)}</tbody></table></div><div className="pagination"><span>{result.data.total} payments · Page {result.data.page} of {result.data.pages}</span><div><button className="button secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>Previous</button><button className="button secondary" disabled={page >= result.data.pages} onClick={() => changePage(page + 1)}>Next</button></div></div></> : <ConnectionState {...result} reload={result.reload} empty="No cash payments match these filters" />}</Panel>
    {selected && <PaymentReceiptModal paymentId={selected} viewerRole={viewerRole} onClose={() => setSelected(undefined)} onChanged={() => { setSelected(undefined); result.reload(); }} />}
  </>;
}
function CashClosingPanel({ onChanged }: { onChanged: () => void }) {
  const summary = useLoad(adminApi.cashClosingSummary);
  const history = useLoad(() => adminApi.cashClosings());
  const [closing, setClosing] = useState(false); const [historyOpen, setHistoryOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState(''); const [countedCash, setCountedCash] = useState(''); const [notes, setNotes] = useState('');
  const [voiding, setVoiding] = useState<CashClosing>(); const [voidReason, setVoidReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const money = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const opening = Number(openingCash) || 0; const counted = Number(countedCash) || 0; const expected = opening + (summary.data?.cashCollected ?? 0); const variance = counted - expected;
  const refresh = () => { summary.reload(); history.reload(); onChanged(); };
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!summary.data) return; setBusy(true); setError(''); try { await adminApi.closeCashDay({ businessDate: summary.data.businessDate, openingCash: opening, countedCash: counted, notes }); setClosing(false); setOpeningCash(''); setCountedCash(''); setNotes(''); refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cash day could not be closed.'); } finally { setBusy(false); } };
  const voidClosing = async () => { if (!voiding) return; setBusy(true); setError(''); try { await adminApi.voidCashClosing(voiding.id, voidReason); setVoiding(undefined); setVoidReason(''); refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Cash closing could not be voided.'); } finally { setBusy(false); } };
  return <Panel className="cash-close-panel"><div className="cash-close-main"><span className="cash-close-icon"><LockKeyhole /></span><div><small>Daily cash control</small><h2>{summary.data?.closing ? 'Today is closed' : 'Today is open'}</h2><p>{summary.data ? `${summary.data.paymentCount} verified payments · ${money(summary.data.cashCollected)} collected` : summary.error ?? 'Loading today’s ledger…'}</p></div><span className={`record-state ${summary.data?.closing ? 'active' : 'paused'}`}>{summary.data?.closing ? 'Closed' : 'Open'}</span><div className="cash-close-actions"><button className="button secondary" onClick={() => setHistoryOpen((value) => !value)}>{historyOpen ? 'Hide history' : 'Closing history'}</button><button className="button primary" disabled={!summary.data || Boolean(summary.data.closing)} onClick={() => { setError(''); setClosing(true); }}>Close today’s cash</button></div></div>
    {historyOpen && <div className="cash-close-history">{history.data?.items.length ? history.data.items.map((item) => <article key={item.id}><div><strong>{new Date(`${item.businessDate}T00:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</strong><small>{item.paymentCount} payments · closed by {item.closedBy}</small></div><span className={`record-state ${item.status === 'CLOSED' ? 'active' : 'cancelled'}`}>{item.status}</span><div><small>Expected</small><strong>{money(item.expectedCash)}</strong></div><div><small>Counted</small><strong>{money(item.countedCash)}</strong></div><div><small>Variance</small><strong className={item.variance === 0 ? '' : item.variance > 0 ? 'positive' : 'negative'}>{money(item.variance)}</strong></div>{item.status === 'CLOSED' && <button className="button danger compact" onClick={() => { setError(''); setVoidReason(''); setVoiding(item); }}>Void closing</button>}</article>) : <p>No completed cash closings yet.</p>}</div>}
    {closing && summary.data && <Modal title="Close today’s cash" onClose={() => setClosing(false)}><form className="form-grid" onSubmit={submit}><div className="notice full-row"><LockKeyhole />After closing, no payment can be added or voided for today unless this closing is voided by the owner.</div><label>Opening cash<input type="number" min="0" max="100000000" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} required /></label><label>Counted cash<input type="number" min="0" max="100000000" step="0.01" value={countedCash} onChange={(event) => setCountedCash(event.target.value)} required /></label><div className="cash-close-calculation full-row"><span><small>Collected</small><strong>{money(summary.data.cashCollected)}</strong></span><span><small>Expected drawer</small><strong>{money(expected)}</strong></span><span><small>Variance</small><strong className={variance === 0 ? '' : variance > 0 ? 'positive' : 'negative'}>{money(variance)}</strong></span></div><label className="full-row">Closing note (optional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} placeholder="Shift note or explanation for any variance" /></label>{error && <div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={() => setClosing(false)}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Closing…' : 'Confirm cash closing'}</button></div></form></Modal>}
    {voiding && <Modal title="Void this cash closing?" onClose={() => setVoiding(undefined)}><div className="notice"><ShieldCheck />This reopens {voiding.businessDate} for corrections. The original closing remains in the audit history.</div><label className="modal-field">Reason<textarea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} minLength={5} maxLength={500} placeholder="Explain why this day must be reopened" /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setVoiding(undefined)}>Cancel</button><button className="button danger" disabled={busy || voidReason.trim().length < 5} onClick={voidClosing}>{busy ? 'Reopening…' : 'Void and reopen day'}</button></div></Modal>}
  </Panel>;
}
function PaymentReceiptModal({ paymentId, viewerRole, onClose, onChanged }: { paymentId: string; viewerRole: AdminUser['role']; onClose: () => void; onChanged: () => void }) {
  const result = useLoad(() => adminApi.payment(paymentId)); const [voiding, setVoiding] = useState(false); const [reason, setReason] = useState(''); const [relatedAction, setRelatedAction] = useState<'KEEP' | 'CANCEL_MEMBERSHIP' | 'VOID_VISIT'>('KEEP'); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const row = result.data; const money = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const executeVoid = async () => { if (!row) return; setBusy(true); setError(''); try { await adminApi.voidPayment(row.id, reason, relatedAction); onChanged(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payment could not be voided.'); } finally { setBusy(false); } };
  return <Modal title="Payment receipt" className="receipt-modal" onClose={onClose}>{!row ? <ConnectionState {...result} reload={result.reload} empty="Payment not found" /> : <><article className="printable-receipt"><header><img src="/logo.png" alt="X-TRIM FIT GYM" /><div><strong>Official cash receipt</strong><span>{row.reference}</span></div><span className={`record-state ${row.status === 'COMPLETED' ? 'active' : 'cancelled'}`}>{row.status}</span></header><div className="receipt-person"><span>Received from</span><strong>{row.payerName}</strong><small>{row.payerReference ?? row.type.replaceAll('_', ' ')}</small></div><dl className="receipt-breakdown"><div><dt>Transaction</dt><dd>{row.type.replaceAll('_', ' ')}</dd></div>{row.membershipFee > 0 && <div><dt>Membership fee</dt><dd>{money(row.membershipFee)}</dd></div>}<div className="receipt-total"><dt>Amount due</dt><dd>{money(row.amountDue)}</dd></div><div><dt>Cash received</dt><dd>{money(row.amountReceived)}</dd></div><div><dt>Change</dt><dd>{money(row.change)}</dd></div><div><dt>Received by</dt><dd>{row.receivedBy}</dd></div><div><dt>Date and time</dt><dd>{new Date(row.receivedAt).toLocaleString()}</dd></div></dl>{row.notes && <p className="receipt-note"><strong>Note</strong>{row.notes}</p>}{row.status === 'VOID' && <div className="receipt-void"><strong>Voided {row.voidedAt ? new Date(row.voidedAt).toLocaleString() : ''}</strong><span>{row.voidReason}</span><small>{row.voidedBy} · {row.relatedRecordAction?.replaceAll('_', ' ')}</small></div>}<footer className="receipt-footer"><strong>X-TRIM FIT GYM</strong><span>Thank you. Keep this receipt for your records.</span><small>{row.reference}</small></footer></article><div className="modal-actions no-print"><button className="button secondary" onClick={() => window.print()}>Print receipt</button>{viewerRole === 'OWNER' && row.status === 'COMPLETED' && <button className="button danger" onClick={() => setVoiding(true)}>Void payment</button>}</div>{voiding && <div className="void-payment-form no-print"><div className="notice"><ShieldCheck />The payment stays in the ledger. Choose what happens to its linked operational record.</div><label>Related record action<PremiumSelect value={relatedAction} onChange={(value) => setRelatedAction(value as typeof relatedAction)} options={[{ value: 'KEEP', label: 'Keep related membership or visit' }, ...(row.type === 'MEMBERSHIP' ? [{ value: 'CANCEL_MEMBERSHIP', label: 'Cancel linked open membership' }] : []), ...(row.type === 'WALK_IN' ? [{ value: 'VOID_VISIT', label: 'Void linked walk-in visit' }] : [])]} placeholder="Choose resolution" /></label><label>Void reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={5} maxLength={500} placeholder="Explain why this payment is being voided" /></label>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setVoiding(false)}>Cancel</button><button className="button danger" disabled={busy || reason.trim().length < 5} onClick={executeVoid}>{busy ? 'Voiding…' : 'Confirm void'}</button></div></div>}</>}</Modal>;
}
function AnnouncementsPage({ viewerRole }: { viewerRole: AdminUser['role'] }) {
  const result = useLoad(adminApi.announcements);
  const [editing, setEditing] = useState<Announcement | null | undefined>();
  const [confirm, setConfirm] = useState<{ item: Announcement; action: 'archive' | 'delete' }>();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const runAction = async () => { if (!confirm) return; setBusy(true); setError(''); try { if (confirm.action === 'archive') await adminApi.archiveAnnouncement(confirm.item.id); else await adminApi.deleteAnnouncement(confirm.item.id); setConfirm(undefined); result.reload(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Announcement could not be updated.'); } finally { setBusy(false); } };
  return <><PageHeader title="Announcements" subtitle="Publish timely updates that appear directly on Member Home." icon={<Megaphone />} action={<button className="button primary" onClick={() => setEditing(null)}><Megaphone />New announcement</button>} />
    <Panel className="announcement-admin-panel">{result.data?.items.length ? <div className="announcement-admin-grid">{result.data.items.map((item) => <article key={item.id} className={`announcement-admin-card ${item.status.toLowerCase()}`}><header><span className={`record-state ${item.status === 'PUBLISHED' ? 'active' : item.status === 'ARCHIVED' ? 'inactive' : 'paused'}`}>{item.status}</span><time>{new Date(item.publishAt ?? item.createdAt).toLocaleString()}</time></header><h2>{item.title}</h2><p>{item.message}</p>{item.expiresAt && <small>Expires {new Date(item.expiresAt).toLocaleString()}</small>}<footer>{item.status !== 'ARCHIVED' && <button className="button secondary" onClick={() => setEditing(item)}><Pencil />Edit</button>}{item.status !== 'ARCHIVED' && <button className="button secondary" onClick={() => setConfirm({ item, action: 'archive' })}><Archive />Archive</button>}{viewerRole === 'OWNER' && item.status === 'DRAFT' && <button className="button danger" onClick={() => setConfirm({ item, action: 'delete' })}><Trash2 />Delete</button>}</footer></article>)}</div> : <ConnectionState {...result} reload={result.reload} empty="No announcements yet" />}</Panel>
    {editing !== undefined && <AnnouncementModal item={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); result.reload(); }} />}
    {confirm && <Modal title={confirm.action === 'archive' ? 'Archive announcement?' : 'Delete draft permanently?'} onClose={() => setConfirm(undefined)}><p><strong>{confirm.item.title}</strong> will {confirm.action === 'archive' ? 'stop appearing in the member portal.' : 'be permanently removed.'}</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setConfirm(undefined)}>Cancel</button><button className="button danger" disabled={busy} onClick={runAction}>{busy ? 'Working…' : confirm.action === 'archive' ? 'Archive' : 'Delete'}</button></div></Modal>}
  </>;
}
function AnnouncementModal({ item, onClose, onSaved }: { item: Announcement | null; onClose: () => void; onSaved: () => void }) {
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED'>(item?.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const localDateTime = (value?: string) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '';
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(''); const data = new FormData(event.currentTarget); const publishAt = String(data.get('publishAt') || ''); const expiresAt = String(data.get('expiresAt') || ''); const input = { title: String(data.get('title')), message: String(data.get('message')), status, publishAt: publishAt ? new Date(publishAt).toISOString() : null, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null }; try { if (item) await adminApi.updateAnnouncement(item.id, input); else await adminApi.createAnnouncement(input); onSaved(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Announcement could not be saved.'); } finally { setBusy(false); } };
  return <Modal title={item ? 'Edit announcement' : 'Create announcement'} onClose={onClose}>
    <form className="form-grid" onSubmit={submit}>
      <label className="full-row">Title<input name="title" defaultValue={item?.title} minLength={3} maxLength={120} required placeholder="Enter a clear announcement title" /></label>
      <label className="full-row">Message<textarea name="message" defaultValue={item?.message} minLength={3} maxLength={2000} required placeholder="Write the update members should see" /></label>
      <label>Status<PremiumSelect value={status} onChange={(value) => setStatus(value as 'DRAFT' | 'PUBLISHED')} options={[{ value: 'DRAFT', label: 'Save as draft' }, { value: 'PUBLISHED', label: 'Publish' }]} placeholder="Choose status" /></label>
      <label className="full-row">Publish date and time<PremiumDateTimePicker name="publishAt" defaultValue={localDateTime(item?.publishAt)} placeholder="Choose publication date" /></label>
      <label className="full-row">Expiry date and time (optional)<PremiumDateTimePicker name="expiresAt" defaultValue={localDateTime(item?.expiresAt)} placeholder="Choose expiry date" /></label>
      {error && <div className="form-error full-row">{error}</div>}
      <div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : status === 'PUBLISHED' ? 'Publish announcement' : 'Save draft'}</button></div>
    </form>
  </Modal>;
}
const reportMoney = (amount: number) => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const reportTypeLabels: Record<ReportData['revenueBreakdown'][number]['type'], string> = { MEMBERSHIP: 'Memberships', WALK_IN: 'Walk-ins', CARD_REPLACEMENT: 'Card replacements' };
function ReportsPage() {
  const [range, setRange] = useState<7 | 30 | 90 | { from: string; to: string }>(30);
  const [customOpen, setCustomOpen] = useState(false); const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [rangeError, setRangeError] = useState('');
  const periodControl = <div className="report-period" aria-label="Report period">{([7, 30, 90] as const).map((value) => <button key={value} className={range === value ? 'active' : ''} onClick={() => { setRange(value); setCustomOpen(false); }}>{value} days</button>)}<button className={typeof range === 'object' ? 'active' : ''} onClick={() => setCustomOpen((value) => !value)}>Custom</button></div>;
  const applyCustom = (event: FormEvent) => { event.preventDefault(); if (!from || !to) { setRangeError('Choose both dates.'); return; } if (from > to) { setRangeError('The start date must be before the end date.'); return; } const span = Math.round((new Date(`${to}T00:00:00+08:00`).getTime() - new Date(`${from}T00:00:00+08:00`).getTime()) / 86_400_000) + 1; if (span > 366) { setRangeError('Choose a range of 366 days or less.'); return; } setRangeError(''); setRange({ from, to }); setCustomOpen(false); };
  return <><PageHeader title="Reports & Analytics" subtitle="Verified cash, visits, membership and member growth summaries." icon={<BarChart3 />} action={periodControl} />{customOpen && <Panel className="report-custom-panel"><form onSubmit={applyCustom}><div><small>Custom reporting window</small><strong>Choose up to 366 calendar days</strong></div><PremiumDatePicker value={from} onChange={setFrom} placeholder="From date" /><PremiumDatePicker value={to} onChange={setTo} placeholder="To date" /><button className="button primary">Apply range</button></form>{rangeError && <div className="form-error">{rangeError}</div>}</Panel>}<ReportsContent key={typeof range === 'number' ? range : `${range.from}-${range.to}`} range={range} /></>;
}
function ReportsContent({ range }: { range: 7 | 30 | 90 | { from: string; to: string } }) {
  const result = useLoad(() => adminApi.reports(range));
  if (!result.data) return <Panel><ConnectionState {...result} reload={result.reload} empty="No report data available" /></Panel>;
  const { summary, daily, monthlyActivity, revenueBreakdown, membershipStatus, topPlans, period } = result.data;
  const days = period.days;
  const average = summary.transactions ? summary.revenue / summary.transactions : 0;
  const chartChunkSize = daily.length > 90 ? Math.ceil(daily.length / 60) : 1;
  const chartDaily = chartChunkSize === 1 ? daily : Array.from({ length: Math.ceil(daily.length / chartChunkSize) }, (_, index) => {
    const chunk = daily.slice(index * chartChunkSize, (index + 1) * chartChunkSize); const last = chunk[chunk.length - 1]!;
    return { date: last.date, revenue: chunk.reduce((total, row) => total + row.revenue, 0), transactions: chunk.reduce((total, row) => total + row.transactions, 0), attendance: chunk.reduce((total, row) => total + row.attendance, 0), walkIns: chunk.reduce((total, row) => total + row.walkIns, 0), newMembers: chunk.reduce((total, row) => total + row.newMembers, 0) };
  });
  const maxRevenue = Math.max(...chartDaily.map((row) => row.revenue), 1);
  const trafficRows = daily.slice(days > 7 ? -14 : 0).reverse();
  const maxTraffic = Math.max(...trafficRows.map((row) => row.attendance + row.walkIns), 1);
  const maxBreakdown = Math.max(...revenueBreakdown.map((row) => row.amount), 1);
  const totalMemberships = Object.values(membershipStatus).reduce((total, value) => total + value, 0);
  const dateLabel = (date: string, compact = false) => new Date(`${date}T00:00:00+08:00`).toLocaleDateString('en-PH', compact ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
  const exportCsv = () => {
    const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
    const rows: Array<Array<string | number>> = [['X-TRIM FIT GYM REPORT'], ['Period', period.from, period.to], [], ['SUMMARY'], ['Metric', 'Value'], ['Cash collected', summary.revenue], ['Transactions', summary.transactions], ['Attendance', summary.attendance], ['Walk-ins', summary.walkIns], ['New members', summary.newMembers], ['Active memberships', summary.activeMemberships], [], ['REVENUE SOURCES'], ['Type', 'Amount', 'Payments'], ...revenueBreakdown.map((row) => [reportTypeLabels[row.type], row.amount, row.count]), [], ['MEMBERSHIP STATUS'], ['Status', 'Records'], ...Object.entries(membershipStatus).map(([status, count]) => [status, count]), [], ['TOP PLANS STARTED'], ['Plan', 'Memberships', 'Value'], ...topPlans.map((plan) => [plan.name, plan.count, plan.value]), [], ['DAILY RECORDS'], ['Date', 'Revenue', 'Transactions', 'Attendance', 'Walk-ins', 'New members'], ...daily.map((row) => [row.date, row.revenue, row.transactions, row.attendance, row.walkIns, row.newMembers])];
    const blob = new Blob([`\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `xtrim-report-${period.from}-to-${period.to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <div className="reports-page" id="printable-report">
    <div className="report-range"><div><CalendarClock /><span>Showing verified records from <strong>{dateLabel(period.from)}</strong> to <strong>{dateLabel(period.to)}</strong></span></div><div className="report-export-actions"><button className="button secondary" onClick={exportCsv}><Download />Export CSV</button><button className="button secondary" onClick={() => window.print()}><Printer />Print / save PDF</button></div></div>
    <section className="report-summary">
      <article><span className="report-icon"><PhilippinePeso /></span><div><small>Cash collected</small><strong>{reportMoney(summary.revenue)}</strong><p>{summary.transactions} verified {summary.transactions === 1 ? 'transaction' : 'transactions'} · {reportMoney(average)} average</p></div></article>
      <article><span className="report-icon"><ScanLine /></span><div><small>Member attendance</small><strong>{summary.attendance.toLocaleString()}</strong><p>Accepted NFC and manual attendance records</p></div></article>
      <article><span className="report-icon"><UserPlus /></span><div><small>Walk-in visits</small><strong>{summary.walkIns.toLocaleString()}</strong><p>Recorded counter visits during this period</p></div></article>
      <article><span className="report-icon"><Users /></span><div><small>New members</small><strong>{summary.newMembers.toLocaleString()}</strong><p>{summary.activeMemberships.toLocaleString()} active memberships today</p></div></article>
    </section>
    <div className="report-grid">
      <MonthlyActivityChart rows={monthlyActivity} />
      <Panel className="report-chart-panel"><div className="report-panel-head"><div><span>Cash performance</span><h2>Revenue trend</h2></div><TrendingUp /></div><div className="revenue-chart" aria-label="Cash revenue trend chart">{chartDaily.map((row, index) => <div className="revenue-column" key={row.date} title={`${dateLabel(row.date)}: ${reportMoney(row.revenue)}${chartChunkSize > 1 ? ` across ${chartChunkSize} days` : ''}`}><div className="revenue-value">{row.revenue > 0 ? reportMoney(row.revenue) : ''}</div><div className="revenue-track"><span style={{ height: `${Math.max(row.revenue ? 7 : 0, (row.revenue / maxRevenue) * 100)}%` }} /></div>{(chartDaily.length <= 10 || index % Math.ceil(chartDaily.length / 7) === 0 || index === chartDaily.length - 1) && <small>{dateLabel(row.date, true)}</small>}</div>)}</div></Panel>
      <Panel className="report-breakdown"><div className="report-panel-head"><div><span>Revenue mix</span><h2>Collection sources</h2></div><PhilippinePeso /></div><div className="breakdown-list">{revenueBreakdown.map((row) => <div key={row.type}><div><span>{reportTypeLabels[row.type]}</span><strong>{reportMoney(row.amount)}</strong></div><div className="breakdown-track"><span style={{ width: `${(row.amount / maxBreakdown) * 100}%` }} /></div><small>{row.count} {row.count === 1 ? 'payment' : 'payments'}</small></div>)}</div></Panel>
      <Panel className="report-traffic"><div className="report-panel-head"><div><span>Gym activity</span><h2>Daily visits</h2></div><Activity /></div><div className="traffic-list">{trafficRows.map((row) => { const total = row.attendance + row.walkIns; return <div key={row.date}><time>{dateLabel(row.date, true)}</time><div className="traffic-track"><span className="member" style={{ width: `${(row.attendance / maxTraffic) * 100}%` }} /><span className="walkin" style={{ width: `${(row.walkIns / maxTraffic) * 100}%` }} /></div><strong>{total}</strong></div>; })}</div><div className="report-legend"><span className="member">Member attendance</span><span className="walkin">Walk-ins</span></div></Panel>
      <Panel className="report-memberships"><div className="report-panel-head"><div><span>Current portfolio</span><h2>Membership health</h2></div><WalletCards /></div><div className="membership-health"><div className="membership-total"><strong>{totalMemberships}</strong><span>Total membership records</span></div><div className="membership-statuses">{Object.entries(membershipStatus).map(([status, count]) => <div key={status}><span className={status} /><small>{status}</small><strong>{count}</strong></div>)}</div></div><div className="top-plans"><h3>Plans started in this period</h3>{topPlans.length ? topPlans.map((plan, index) => <div key={plan.name}><span>{index + 1}</span><div><strong>{plan.name}</strong><small>{plan.count} {plan.count === 1 ? 'membership' : 'memberships'}</small></div><b>{reportMoney(plan.value)}</b></div>) : <p>No memberships started in this period.</p>}</div></Panel>
    </div>
  </div>;
}

function MonthlyActivityChart({ rows }: { rows: ReportData['monthlyActivity'] }) {
  const width = 760; const height = 250; const left = 44; const right = 18; const top = 22; const bottom = 42;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...rows.flatMap((row) => [row.memberships, row.walkIns]));
  const scaleMaximum = maximum <= 4 ? maximum : Math.ceil(maximum / 4) * 4;
  const tickValues = scaleMaximum <= 4 ? Array.from({ length: scaleMaximum + 1 }, (_, index) => index) : Array.from({ length: 5 }, (_, index) => (scaleMaximum / 4) * index);
  const point = (value: number, index: number) => ({ x: left + (rows.length > 1 ? (index / (rows.length - 1)) * plotWidth : plotWidth / 2), y: top + plotHeight - ((value / scaleMaximum) * plotHeight) });
  const membershipPoints = rows.map((row, index) => point(row.memberships, index)); const walkInPoints = rows.map((row, index) => point(row.walkIns, index));
  const curvePath = (points: Array<{ x: number; y: number }>) => points.length < 2 ? points.length ? `M ${points[0].x} ${points[0].y}` : '' : points.reduce((path, current, index) => {
    if (index === 0) return `M ${current.x} ${current.y}`;
    const previous = points[index - 1]; const before = points[index - 2] ?? previous; const next = points[index + 1] ?? current;
    const controlOne = { x: previous.x + (current.x - before.x) / 6, y: previous.y + (current.y - before.y) / 6 };
    const controlTwo = { x: current.x - (next.x - previous.x) / 6, y: current.y - (next.y - previous.y) / 6 };
    return `${path} C ${controlOne.x} ${controlOne.y}, ${controlTwo.x} ${controlTwo.y}, ${current.x} ${current.y}`;
  }, '');
  const areaPath = (points: Array<{ x: number; y: number }>) => points.length ? `${curvePath(points)} L ${points[points.length - 1].x} ${top + plotHeight} L ${points[0].x} ${top + plotHeight} Z` : '';
  const monthLabel = (month: string, long = false) => new Date(`${month}-01T00:00:00+08:00`).toLocaleDateString('en-PH', long ? { month: 'long', year: 'numeric' } : { month: 'short' });
  const totalMemberships = rows.reduce((total, row) => total + row.memberships, 0); const totalWalkIns = rows.reduce((total, row) => total + row.walkIns, 0);
  const totalActivity = totalMemberships + totalWalkIns; const membershipShare = totalActivity ? Math.round((totalMemberships / totalActivity) * 100) : 0;
  const topMonths = [...rows].sort((first, second) => (second.memberships + second.walkIns) - (first.memberships + first.walkIns)).filter((row) => row.memberships + row.walkIns > 0).slice(0, 3);
  const busiestTotal = Math.max(1, ...topMonths.map((row) => row.memberships + row.walkIns));
  return <Panel className="report-monthly-panel">
    <div className="monthly-title"><div><span>Annual activity intelligence</span><h2>Memberships and walk-ins</h2><p>Monthly demand across the latest twelve-month window</p></div><span className="monthly-title-icon"><TrendingUp /></span></div>
    <div className="monthly-content-grid">
      <div className="monthly-chart-shell">
        <div className="monthly-chart-head"><div><span>Activity volume</span><small>Hover over a point for exact values</small></div><div className="monthly-legend"><span className="memberships">Memberships</span><span className="walkins">Walk-ins</span></div></div>
        <div className="monthly-line-chart"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly membership entries and walk-in visits over the last twelve months">
          <defs><linearGradient id="membershipArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d7bf62" stopOpacity=".24"/><stop offset="100%" stopColor="#d7bf62" stopOpacity="0"/></linearGradient><linearGradient id="walkInArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#68b9ab" stopOpacity=".2"/><stop offset="100%" stopColor="#68b9ab" stopOpacity="0"/></linearGradient><filter id="chartGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
          {tickValues.map((value) => { const y = top + plotHeight - ((value / scaleMaximum) * plotHeight); return <g key={value}><line className="monthly-grid-line" x1={left} x2={width - right} y1={y} y2={y}/><text className="monthly-y-label" x={left - 13} y={y + 4}>{value}</text></g>; })}
          <path className="monthly-area memberships" d={areaPath(membershipPoints)}/><path className="monthly-area walkins" d={areaPath(walkInPoints)}/>
          <path className="monthly-line memberships" d={curvePath(membershipPoints)}/><path className="monthly-line walkins" d={curvePath(walkInPoints)}/>
          {rows.map((row, index) => <g className="monthly-point-group" key={row.month}><line className="monthly-hover-guide" x1={membershipPoints[index].x} x2={membershipPoints[index].x} y1={top} y2={top + plotHeight}/><rect className="monthly-hit-area" x={membershipPoints[index].x - (plotWidth / Math.max(rows.length - 1, 1)) / 2} y={top} width={plotWidth / Math.max(rows.length - 1, 1)} height={plotHeight}><title>{monthLabel(row.month, true)} — {row.memberships} memberships, {row.walkIns} walk-ins</title></rect><circle className="monthly-dot memberships" cx={membershipPoints[index].x} cy={membershipPoints[index].y} r="4.5"/><circle className="monthly-dot walkins" cx={walkInPoints[index].x} cy={walkInPoints[index].y} r="4.5"/>{row.memberships > 0 && <text className="monthly-point-value memberships" x={membershipPoints[index].x} y={membershipPoints[index].y - 12}>{row.memberships}</text>}{row.walkIns > 0 && <text className="monthly-point-value walkins" x={walkInPoints[index].x} y={walkInPoints[index].y + 18}>{row.walkIns}</text>}<text className="monthly-x-label" x={membershipPoints[index].x} y={height - 10}>{monthLabel(row.month)}</text></g>)}
        </svg></div>
      </div>
      <aside className="monthly-snapshot">
        <header><div><span>Demand snapshot</span><strong>{totalActivity.toLocaleString()} total activities</strong></div><small>Last 12 months</small></header>
        <div className="monthly-mix"><div className="monthly-mix-ring" style={{ background: totalActivity ? `conic-gradient(#d2bb63 0 ${membershipShare}%, #67aea2 ${membershipShare}% 100%)` : '#242a2f' }}><span><strong>{membershipShare}%</strong><small>memberships</small></span></div><div className="monthly-mix-details"><div><i className="memberships"/><span>Memberships</span><strong>{totalMemberships}</strong></div><div><i className="walkins"/><span>Walk-ins</span><strong>{totalWalkIns}</strong></div></div></div>
        <section className="monthly-ranking"><div><span>Busiest months</span><small>Combined demand</small></div>{topMonths.length ? topMonths.map((row, index) => { const total = row.memberships + row.walkIns; return <article key={row.month}><b>{index + 1}</b><div><span>{monthLabel(row.month, true)}</span><i><em style={{ width: `${(total / busiestTotal) * 100}%` }}/></i></div><strong>{total}</strong></article>; }) : <p>Activity will appear here as records are added.</p>}</section>
      </aside>
    </div>
  </Panel>;
}
function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) { return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X /></button></div>{children}</div></div>; }

function FirstPassword({ user, onComplete }: { user: AdminUser; onComplete: (user: AdminUser) => void }) {
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState(''); const [confirmPassword, setConfirmPassword] = useState(''); const [visible, setVisible] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); if (newPassword !== confirmPassword) { setError('New passwords do not match.'); return; } setBusy(true); try { await authApi.initializePassword(currentPassword, newPassword); onComplete({ ...user, mustChangePassword: false }); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not change the temporary password.'); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-visual"><img src="/logo.png" alt="X-TRIM FIT GYM" /><div><span className="eyebrow">ACCOUNT SECURITY</span><h1>One secure<br />first step.</h1><p>Replace the temporary password before managing gym operations.</p></div></section><section className="login-form"><div><span className="eyebrow">PASSWORD REQUIRED</span><h2>Create your password</h2><p>Use at least 10 characters with uppercase, lowercase, and a number.</p><form onSubmit={submit}><label>Temporary password<input type={visible ? 'text' : 'password'} value={currentPassword} placeholder="Enter the temporary password" onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label>New password<input type={visible ? 'text' : 'password'} value={newPassword} placeholder="Create a secure password" onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /></label><label>Confirm new password<input type={visible ? 'text' : 'password'} value={confirmPassword} placeholder="Enter the new password again" onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></label><button type="button" className="button secondary" onClick={() => setVisible(!visible)}>{visible ? <EyeOff /> : <Eye />}{visible ? 'Hide passwords' : 'Show passwords'}</button>{error && <div className="form-error">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Saving…' : 'Set password and continue'}</button></form></div></section></main>;
}

export default function App() {
  const [auth, setAuth] = useState<{ loading: boolean; user?: AdminUser }>({ loading: true });
  const navigate = useNavigate();
  useEffect(() => {
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_PREVIEW === 'true') {
      setAuth({ loading: false, user: { id: 'local-preview', username: 'admin-preview', firstName: 'Admin', lastName: 'Preview', role: 'OWNER' } });
      return;
    }
    authApi.me().then((user) => { if ((user as { role: string }).role === 'OWNER' || (user as { role: string }).role === 'ADMIN') setAuth({ loading: false, user }); else window.location.replace('/portal/home'); }).catch(() => setAuth({ loading: false }));
  }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { window.location.replace('/login'); } }, []);
  if (auth.loading) return <div className="boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Securing admin portal…</span></div>;
  if (!auth.user) { window.location.replace('/login'); return <div className="boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Returning to sign in…</span></div>; }
  if (auth.user.mustChangePassword) return <FirstPassword user={auth.user} onComplete={(user) => { setAuth({ loading: false, user }); navigate('/dashboard'); }} />;
  return <Shell user={auth.user} onLogout={logout} onUserChange={(user) => setAuth({ loading: false, user })} />;
}
