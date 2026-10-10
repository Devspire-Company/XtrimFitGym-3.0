import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import {
  Activity, BarChart3, CalendarClock, ScanLine, Dumbbell, Eye, EyeOff,
  Home, IdCard, KeyRound, LogOut, Menu, PhilippinePeso, RefreshCw, Search, Settings, ShieldCheck,
  CheckCircle2, Pencil, Power, UserCheck, UserPlus, UserRound, Users, WalletCards, WifiOff, X,
} from 'lucide-react';
import { adminApi, authApi, type AdminUser, type AttendanceRecord, type DashboardData, type Member, type MemberType, type Plan, type PlanEligibility } from './api';
import { capitalizeNameParts, formatMobileNumber, PremiumDatePicker, PremiumSelect } from './FormControls';
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
  ['/payments', 'Cash Payments', PhilippinePeso], ['/coaches', 'Coaches', Dumbbell], ['/reports', 'Reports', BarChart3],
] as const;

function Shell({ user, onLogout, onUserChange }: { user: AdminUser; onLogout: () => Promise<void>; onUserChange: (user: AdminUser) => void }) {
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
      <nav>{nav.map(([path, label, Icon]) => <Link key={path} to={path} onClick={() => setOpen(false)} className={location.pathname === path || (path === '/members' && location.pathname.startsWith('/members/')) ? 'active' : ''}><Icon /><span>{label}</span></Link>)}</nav>
      <div className="sidebar-foot">
        <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''}><Settings /><span>Settings</span></Link>
        <button onClick={() => setConfirmLogout(true)}><LogOut /><span>Log out</span></button>
      </div>
    </aside>
    <main className="main"><Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/members" element={<MembersPage />} />
      <Route path="/members/:memberId" element={<MemberDetailPage />} />
      <Route path="/memberships" element={<MembershipsPage />} />
      <Route path="/nfc-cards" element={<CardsPage />} />
      <Route path="/attendance" element={<AttendancePage />} />
      <Route path="/walk-ins" element={<WalkInsPage />} />
      <Route path="/payments" element={<PaymentsPage />} />
      <Route path="/coaches" element={<StandardPage title="Coach Management" subtitle="Publish coach profiles and availability for members." icon={<Dumbbell />} endpoint="Coach records will come from the 3.0 API." />} />
      <Route path="/reports" element={<StandardPage title="Reports & Analytics" subtitle="Membership, attendance, walk-in and cash summaries from verified records." icon={<BarChart3 />} endpoint="Reports remain empty until authoritative transactions exist." />} />
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
  const cards = result.data ? [
    ['Active members', result.data.activeMembers, Users], ['Attendance today', result.data.attendanceToday, ScanLine],
    ['Walk-ins today', result.data.walkInsToday, UserPlus], ['Cash received today', `₱${result.data.cashToday.toLocaleString()}`, PhilippinePeso],
    ['Cards pending', result.data.cardsPending, IdCard], ['Expiring soon', result.data.expiringSoon, CalendarClock],
  ] as const : [];
  return <div className="dashboard-page">
    <Panel className="hero"><div className="hero-copy"><span className="eyebrow">X-TRIM CONTROL DESK</span><h2><span>Train hard.</span><em>Manage smarter.</em></h2><p>Membership, cash, NFC attendance and walk-ins—one accountable workflow.</p></div><div className="hero-image" aria-hidden="true" /></Panel>
    {result.data ? <><div className="stats">{cards.map(([label, value, Icon]) => <Panel key={label} className="stat"><div className="stat-icon"><Icon /></div><div className="stat-copy"><span>{label}</span><strong>{label === 'Cash received today' ? <><b className="stat-peso">₱</b>{String(value).replace(/^₱/, '')}</> : value}</strong></div></Panel>)}</div><Panel><div className="panel-title"><h3>Recent activity</h3></div>{result.data.recentActivity.length ? <div className="activity-list">{result.data.recentActivity.map((item) => <div key={item.id}><strong>{item.label}</strong><span>{item.detail}</span><time>{new Date(item.occurredAt).toLocaleString()}</time></div>)}</div> : <ConnectionState loading={false} reload={result.reload} empty="No activity recorded yet" />}</Panel></> : <Panel><ConnectionState {...result} reload={result.reload} empty="No operational records yet" /></Panel>}
  </div>;
}

function MembersPage() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [showFlow, setShowFlow] = useState(false);
  const result = useLoad(() => adminApi.members(submitted));
  return <><PageHeader title="Member Management" subtitle="Create members, preserve walk-in history, activate plans and assign cards." icon={<Users />} action={<button className="button primary" onClick={() => setShowFlow(true)}><UserPlus />New member</button>} />
    <Panel><form className="toolbar" onSubmit={(e) => { e.preventDefault(); setSubmitted(query); result.reload(); }}><label className="search"><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by member name, number or phone" /></label><button className="button secondary">Search</button></form></Panel>
    <Panel className="member-results-panel">{result.data?.items.length ? <MemberTable items={result.data.items} /> : <ConnectionState {...result} reload={result.reload} empty="No members found" />}</Panel>
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
  const [consents, setConsents] = useState({ terms: false, privacy: false, liability: false });
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
  const nextFromPayment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    if (memberType === 'STUDENT' && !studentIdVerified) { setError('Confirm that the member presented a valid student ID.'); return; }
    if (selectedPlan && Number(amountReceived) < totalDue) { setError(`Cash received must be at least ₱${totalDue.toLocaleString()}.`); return; }
    setStep(3);
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
        consent: { termsAccepted: consents.terms, privacyAccepted: consents.privacy, liabilityAccepted: consents.liability, version: '2026-10-10' },
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
  const hasUnsavedInput = Object.values(details).some(Boolean) || Boolean(planId || amountReceived || username || cardUid || studentIdVerified) || memberType !== 'REGULAR' || Object.values(consents).some(Boolean) || step > 1;
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
    { title: 'Plan, payment & consent', icon: <WalletCards /> },
    { title: 'Account credentials', icon: <KeyRound /> },
    { title: 'NFC card', icon: <IdCard /> },
  ];
  return <Modal title="New membership" onClose={closeWizard} className="enrollment-modal"><div className="enrollment-wizard">
    <ol className="enrollment-progress">{enrollmentSteps.map((item,index)=><li key={item.title} className={step===index+1?'current':step>index+1?'complete':''}><span>{step>index+1?<CheckCircle2/>:item.icon}</span><small>{item.title}</small></li>)}</ol>
    {step===1&&<form className="form-grid enrollment-form enrollment-details" onSubmit={nextFromDetails}><div className="step-intro full-row"><span>Step 1 of 4</span><h3>Personal information</h3></div><div className="identity-fields full-row"><label>First name<input value={details.firstName} onChange={(e)=>updateDetail('firstName',capitalizeNameParts(e.target.value))} placeholder="Enter first name" autoComplete="given-name" autoCapitalize="words" required/></label><label>Last name<input value={details.lastName} onChange={(e)=>updateDetail('lastName',capitalizeNameParts(e.target.value))} placeholder="Enter last name" autoComplete="family-name" autoCapitalize="words" required/></label><label>Mobile number<input value={details.phone} onChange={(e)=>updateDetail('phone',formatMobileNumber(e.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" autoComplete="tel" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" required/></label></div><div className="secondary-fields full-row"><label>Email<input value={details.email} onChange={(e)=>updateDetail('email',e.target.value)} type="email" placeholder="name@email.com" autoComplete="email"/></label><label>Birth date<PremiumDatePicker name="birthDate" value={details.birthDate} onChange={(value)=>updateDetail('birthDate',value)} placeholder="Select birth date" max={new Date().toISOString().slice(0,10)} variant="wheel" required/></label></div><section className="emergency-fields full-row"><div className="enrollment-section-title"><span>Emergency contact</span></div><div><label>Full name<input value={details.emergencyName} onChange={(e)=>updateDetail('emergencyName',capitalizeNameParts(e.target.value))} placeholder="Enter full name" autoComplete="off" autoCapitalize="words" required/></label><label>Relationship<PremiumSelect value={details.emergencyRelationship} onChange={(value)=>updateDetail('emergencyRelationship',value)} required placement="up" placeholder="Choose relationship" options={['Parent','Spouse or partner','Sibling','Guardian','Relative','Friend','Other'].map((label)=>({value:label,label}))}/></label><label>Mobile number<input value={details.emergencyPhone} onChange={(e)=>updateDetail('emergencyPhone',formatMobileNumber(e.target.value))} placeholder="09XX XXX XXXX" inputMode="numeric" autoComplete="off" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" required/></label></div></section><div className="modal-actions full-row"><button type="button" className="button secondary" onClick={closeWizard}>Cancel</button><button className="button primary">Continue</button></div></form>}
    {step===2&&<form className="form-grid enrollment-form" onSubmit={nextFromPayment}><div className="step-intro full-row"><span>Step 2 of 4</span><h3>Plan, payment & consent</h3><p>Confirm eligibility, the counter payment, and required member acknowledgements.</p></div><label>Member type<PremiumSelect value={memberType} onChange={(value)=>{setMemberType(value as MemberType);setStudentIdVerified(false);setPlanId('');setError('')}} required placeholder="Choose member type" options={[{value:'REGULAR',label:'Regular'},{value:'STUDENT',label:'Student'}]}/></label>{memberType==='STUDENT'?<label className="student-verification"><span>Student verification</span><span className="verification-check"><input type="checkbox" checked={studentIdVerified} onChange={(event)=>setStudentIdVerified(event.target.checked)} required/>Valid student ID presented</span></label>:<div className="eligibility-note"><span>Pricing eligibility</span><strong>Regular membership plans</strong></div>}<label className="full-row">Membership plan<PremiumSelect value={planId} onChange={setPlanId} required placeholder="Choose a membership plan" options={activePlans.map((plan)=>({value:plan._id,label:`${plan.name} · ₱${plan.price.toLocaleString()} · ${plan.durationDays} days${plan.isPromo?' · Promo':''}`}))}/></label><label>Cash received<div className={`currency-input${amountReceived?' has-value':''}`}>{amountReceived&&<span aria-hidden="true">₱</span>}<input type="number" min="0" step="0.01" placeholder="Enter amount received" inputMode="decimal" value={amountReceived} onChange={(event)=>setAmountReceived(event.target.value)} required/></div></label><div className="payment-summary membership-breakdown"><span>Plan price <b>{selectedPlan?`₱${selectedPlan.price.toLocaleString()}`:'—'}</b></span><span>First membership fee <b>₱{firstMembershipFee.toLocaleString()}</b></span><strong>Total due {selectedPlan?`₱${totalDue.toLocaleString()}`:'—'}</strong><small>{selectedPlan&&amountReceived&&Number(amountReceived)>=totalDue?`Change: ₱${(Number(amountReceived)-totalDue).toLocaleString()}`:'Select a plan and enter the cash received.'}</small></div><div className="consent-list full-row"><label><input type="checkbox" checked={consents.terms} onChange={(e)=>setConsents({...consents,terms:e.target.checked})} required/><span><strong>Membership terms</strong><small>The member reviewed and accepted the current membership terms.</small></span></label><label><input type="checkbox" checked={consents.privacy} onChange={(e)=>setConsents({...consents,privacy:e.target.checked})} required/><span><strong>Privacy notice</strong><small>The member was informed how their account and attendance data will be used.</small></span></label><label><input type="checkbox" checked={consents.liability} onChange={(e)=>setConsents({...consents,liability:e.target.checked})} required/><span><strong>Liability acknowledgement</strong><small>The member reviewed and accepted the current gym liability notice.</small></span></label></div>{plans.error&&<div className="form-error full-row">{plans.error}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');setStep(1)}}>Back</button><button className="button primary" disabled={!activePlans.length}>Continue</button></div></form>}
    {step===3&&!result&&<form className="form-grid enrollment-form" onSubmit={createMembership}><div className="step-intro full-row"><span>Step 3 of 4</span><h3>Create member account</h3><p>Choose the Member PWA username. The system will securely generate a temporary password.</p></div><label className="full-row">Member username<input value={username} onChange={(e)=>setUsername(e.target.value)} placeholder="Create a member username" autoComplete="off" minLength={3} required/></label><div className="creation-summary full-row"><div><span>Member</span><strong>{details.firstName} {details.lastName}</strong></div><div><span>Plan</span><strong>{selectedPlan?.name}</strong></div><div><span>Cash</span><strong>₱{Number(amountReceived).toLocaleString()}</strong></div></div><div className="notice full-row"><ShieldCheck/>Creating the account also activates the membership and records the cash payment as one protected transaction.</div>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={()=>{setError('');setStep(2)}}>Back</button><button className="button primary" disabled={busy}>{busy?'Creating…':'Create membership'}</button></div></form>}
    {step===3&&result&&<div className="credential-step"><div className="step-intro"><span>Step 3 of 4</span><h3>Account created</h3><p>Give these one-time credentials to the member before continuing.</p></div><div className="credential-box"><div><span>Member number</span><strong>{result.memberNumber}</strong></div><div><span>Username</span><strong>{result.username}</strong></div><div><span>Temporary password</span><strong>{result.temporaryPassword}</strong></div><div><span>Payment reference</span><strong>{result.paymentReference}</strong></div></div><label className="credential-confirm"><input type="checkbox" checked={credentialsConfirmed} onChange={(e)=>{setCredentialsConfirmed(e.target.checked);setError('')}}/><span>I have securely given or saved these credentials.</span></label><div className="notice"><ShieldCheck/>The member must replace the temporary password during their first Member PWA login.</div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="button primary" disabled={!credentialsConfirmed} onClick={()=>setStep(4)}>Continue to NFC card</button></div></div>}
    {step===4&&!cardResult&&<form className="form-grid enrollment-form" onSubmit={assignCard}><div className="step-intro full-row"><span>Step 4 of 4</span><h3>Assign NFC card</h3><p>Tap the blank card on the R80C reader, then verify the detected UID before assigning it.</p></div><label className="full-row">Card UID<input value={cardUid} onChange={(e)=>setCardUid(e.target.value)} placeholder="Tap the card on the R80C reader" autoFocus minLength={4} required/></label><div className="notice full-row"><IdCard/>The card will be linked only to {details.firstName} {details.lastName}. It can be revoked or replaced later.</div>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions enrollment-final-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Assign card later</button><button className="button primary" disabled={busy}>{busy?'Assigning…':'Assign card'}</button></div></form>}
    {step===4&&cardResult&&<div className="enrollment-complete"><CheckCircle2 className="complete-mark"/><div className="step-intro"><span>Enrollment complete</span><h3>Member is ready</h3><p>The account, membership, payment, and NFC assignment were completed successfully.</p></div><ul className="completion-list"><li><CheckCircle2/>Member and account created</li><li><CheckCircle2/>Membership activated</li><li><CheckCircle2/>Cash payment recorded</li><li><CheckCircle2/>Credentials generated</li><li><CheckCircle2/>NFC card assigned</li></ul><div className="credential-box"><div><span>Card UID</span><strong>{cardResult.uid}</strong></div><div><span>Write this URL to the NTAG215 card</span><strong className="break-all">{cardResult.portalUrl}</strong></div></div><p className="completion-note">Test both the R80C UID scan and the phone tap before handing the card to the member.</p><div className="modal-actions"><button className="button primary" onClick={onClose}>Done</button></div></div>}
    {showDiscardConfirm&&<div className="discard-confirm-layer" role="presentation" onMouseDown={()=>setShowDiscardConfirm(false)}><div className="discard-confirm" role="alertdialog" aria-modal="true" aria-labelledby="discard-membership-title" aria-describedby="discard-membership-copy" onMouseDown={(event)=>event.stopPropagation()}><span className="discard-kicker">Unsaved membership</span><h3 id="discard-membership-title">Discard your changes?</h3><p id="discard-membership-copy">The information entered in this membership has not been saved. If you leave now, it will be lost.</p><div className="discard-actions"><button type="button" className="button secondary" autoFocus onClick={()=>setShowDiscardConfirm(false)}>Keep editing</button><button type="button" className="button danger" onClick={onClose}>Discard changes</button></div></div></div>}
  </div></Modal>;
}

function MembershipsPage(){
  const plans=useLoad(adminApi.plans); const[editing,setEditing]=useState<Plan|null|undefined>(undefined); const[confirm,setConfirm]=useState<Plan>(); const[error,setError]=useState('');
  const toggle=async()=>{if(!confirm)return;setError('');try{await adminApi.setPlanStatus(confirm._id,!confirm.isActive);setConfirm(undefined);plans.reload()}catch(c){setError(c instanceof Error?c.message:'Could not update the plan')}};
  return <><PageHeader title="Membership Management" subtitle="Authoritative prices, eligibility and durations used during enrollment and renewal." icon={<WalletCards/>} action={<button className="button primary" onClick={()=>setEditing(null)}>New plan</button>}/>{error&&<div className="form-error">{error}</div>}<Panel className="plans-panel">{plans.data?.items.length?<div className="table-wrap"><table className="plans-table"><thead><tr><th>Plan</th><th>Price</th><th>Duration</th><th>Eligibility</th><th>Type</th><th>Status</th><th className="plan-actions-heading"><span className="sr-only">Actions</span></th></tr></thead><tbody>{plans.data.items.map(p=><tr key={p._id}><td><strong>{p.name}</strong></td><td>₱{p.price.toLocaleString()}</td><td>{p.durationDays} days</td><td>{p.eligibility==='ALL'?'Everyone':p.eligibility==='STUDENT'?'Students':'Regular members'}</td><td><span className={`plan-type ${p.isPromo?'promo':'standard'}`}>{p.isPromo?'Promo':'Standard'}</span></td><td><span className={`plan-state ${p.isActive?'active':'inactive'}`}>{p.isActive?'Active':'Inactive'}</span></td><td className="plan-actions-cell"><div className="plan-icon-actions"><button type="button" className="plan-icon-button edit" onClick={()=>setEditing(p)} aria-label={`Edit ${p.name}`} title="Edit plan"><Pencil/><span className="sr-only">Edit plan</span></button><button type="button" className={`plan-icon-button ${p.isActive?'disable':'enable'}`} onClick={()=>setConfirm(p)} aria-label={`${p.isActive?'Disable':'Enable'} ${p.name}`} title={`${p.isActive?'Disable':'Enable'} plan`}><Power/><span className="sr-only">{p.isActive?'Disable':'Enable'} plan</span></button></div></td></tr>)}</tbody></table></div>:<ConnectionState {...plans} reload={plans.reload} empty="No membership plans yet"/>}</Panel>{editing!==undefined&&<PlanModal plan={editing} onClose={()=>setEditing(undefined)} onSaved={()=>{setEditing(undefined);plans.reload()}}/>}{confirm&&<Modal title={`${confirm.isActive?'Disable':'Enable'} plan?`} onClose={()=>setConfirm(undefined)}><p>{confirm.isActive?'The plan will no longer be offered for new enrollments or renewals. Existing memberships remain unchanged.':'The plan will become available for enrollments and renewals.'}</p><div className="modal-actions"><button className="button secondary" onClick={()=>setConfirm(undefined)}>Cancel</button><button className={confirm.isActive?'button danger':'button primary'} onClick={toggle}>{confirm.isActive?'Disable plan':'Enable plan'}</button></div></Modal>}</>;
}
function PlanModal({plan,onClose,onSaved}:{plan:Plan|null;onClose:()=>void;onSaved:()=>void}){const[error,setError]=useState('');const[busy,setBusy]=useState(false);const[eligibility,setEligibility]=useState<PlanEligibility>(plan?.eligibility??'ALL');const[isPromo,setIsPromo]=useState(plan?.isPromo??false);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setBusy(true);const d=new FormData(e.currentTarget);const input={name:String(d.get('name')),price:Number(d.get('price')),durationDays:Number(d.get('durationDays')),eligibility,isPromo};try{if(plan)await adminApi.updatePlan(plan._id,input);else await adminApi.createPlan(input);onSaved()}catch(c){setError(c instanceof Error?c.message:'Could not save plan')}finally{setBusy(false)}};return <Modal title={plan?'Edit membership plan':'Create membership plan'} onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Plan name<input name="name" placeholder="e.g. 3-Month Student Promo" defaultValue={plan?.name} required/></label><label>Price (₱)<input name="price" type="number" min="0" step="0.01" placeholder="Enter plan price" inputMode="decimal" defaultValue={plan?.price} required/></label><label>Duration (days)<input name="durationDays" type="number" min="1" placeholder="Enter number of days" inputMode="numeric" defaultValue={plan?.durationDays} required/></label><label className="full-row">Who can use this plan?<PremiumSelect value={eligibility} onChange={(value)=>setEligibility(value as PlanEligibility)} placeholder="Choose plan eligibility" options={[{value:'ALL',label:'Everyone'},{value:'STUDENT',label:'Students only'},{value:'REGULAR',label:'Regular members only'}]}/></label><label className="full-row verification-check"><input type="checkbox" checked={isPromo} onChange={(event)=>setIsPromo(event.target.checked)}/><span><strong>Promotional plan</strong><small>This permanent promo remains available until an administrator disables the plan.</small></span></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy?'Saving…':plan?'Save plan':'Create plan'}</button></div></form></Modal>}

function AttendancePage() {
  const records = useLoad(adminApi.attendance);
  const [mode, setMode] = useState(false);
  const [manual, setManual] = useState(false);
  const [uid, setUid] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (mode) input.current?.focus(); }, [mode]);
  const scan = async (event: FormEvent) => { event.preventDefault(); if (!uid.trim() || busy) return; setBusy(true); try { const result = await adminApi.recordAttendance(uid.trim()); setMessage(result.message); setUid(''); records.reload(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Scan failed'); } finally { setBusy(false); input.current?.focus(); } };
  return <><PageHeader title="NFC Attendance" subtitle="Record verified card scans, with manual attendance available only as an accountable fallback." icon={<ScanLine />} action={<div className="header-actions"><button className="button secondary" onClick={() => setManual(true)}><UserCheck />Manual attendance</button><button className={`button ${mode ? 'danger' : 'primary'}`} onClick={() => { setMode(!mode); setMessage(''); }}>{mode ? 'Stop attendance mode' : 'Start attendance mode'}</button></div>} />
    <Panel className={mode ? 'scanner active' : 'scanner'}><div><span className="eyebrow">R80C USB READER</span><h3>{mode ? 'Ready for a card' : 'Scanner is locked'}</h3><p>{mode ? 'Tap the NTAG215 card on the reader. Keep this window active.' : 'Start Attendance Mode before accepting any card input.'}</p></div><form onSubmit={scan}><input ref={input} value={uid} onChange={(e) => setUid(e.target.value)} disabled={!mode} autoComplete="off" aria-label="Card UID" placeholder="Card UID appears here" /><button className="button primary" disabled={!mode || busy}>Process</button></form>{message && <div className="scan-result">{message}</div>}</Panel>
    <Panel><div className="panel-title"><h3>Recent attendance</h3></div>{records.data?.items.length ? <AttendanceTable items={records.data.items} /> : <ConnectionState {...records} reload={records.reload} empty="No attendance records yet" />}</Panel>
    {manual&&<ManualAttendanceModal onClose={()=>setManual(false)} onSaved={(confirmation)=>{setManual(false);setMessage(confirmation);records.reload()}}/>}
  </>;
}
function AttendanceTable({ items }: { items: AttendanceRecord[] }) { return <div className="table-wrap"><table><thead><tr><th>Member</th><th>Member no.</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{items.map((row) => <tr key={row.id}><td><strong>{row.memberName}</strong></td><td>{row.memberNumber}</td><td><span className="status">{row.status}</span></td><td>{new Date(row.recordedAt).toLocaleString()}</td></tr>)}</tbody></table></div>; }

function ManualAttendanceModal({onClose,onSaved}:{onClose:()=>void;onSaved:(message:string)=>void}){
  const members=useLoad(()=>adminApi.members()); const[error,setError]=useState(''); const[busy,setBusy]=useState(false);
  const eligible=members.data?.items.filter(member=>member.status==='ACTIVE'&&member.membership?.status==='ACTIVE'&&new Date(member.membership.expiresAt)>new Date())??[];
  const submit=async(event:FormEvent<HTMLFormElement>)=>{event.preventDefault();setBusy(true);setError('');const data=new FormData(event.currentTarget);try{const result=await adminApi.recordManualAttendance(String(data.get('memberId')),String(data.get('reason')));onSaved(result.message)}catch(cause){setError(cause instanceof Error?cause.message:'Could not record manual attendance.')}finally{setBusy(false)}};
  return <Modal title="Record manual attendance" onClose={onClose}><form className="form-grid" onSubmit={submit}><div className="notice full-row"><ShieldCheck />Use this only when an eligible member cannot present their NFC card. The administrator and reason are written to the audit trail.</div><label className="full-row">Active member<PremiumSelect name="memberId" required placeholder="Choose an active member" options={eligible.map(member=>({value:member.id,label:`${member.fullName} · ${member.memberNumber} · ${member.membership?.plan}`}))}/></label><label className="full-row">Reason<input name="reason" required minLength={3} maxLength={300} placeholder="e.g. Member forgot their NFC card" /></label>{members.loading&&<p className="muted full-row">Loading eligible members…</p>}{!members.loading&&!members.error&&!eligible.length&&<div className="form-error full-row">No members currently have an active account and active membership.</div>}{members.error&&<div className="form-error full-row">{members.error}</div>}{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy||members.loading||!eligible.length}>{busy?'Recording…':'Record attendance'}</button></div></form></Modal>;
}

function CardsPage() {
  const result = useLoad(adminApi.cards);
  const[show,setShow]=useState(false);
  return <><PageHeader title="NFC Card Management" subtitle="Assign, verify, revoke and replace physical membership cards." icon={<IdCard />} action={<button className="button primary" onClick={()=>setShow(true)}><IdCard />Assign card</button>} /><div className="notice"><ShieldCheck />Card UIDs and portal tokens are identifiers, never passwords.</div><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>UID</th><th>Assigned member</th><th>Status</th></tr></thead><tbody>{result.data.items.map((card) => <tr key={card.id}><td><code>{card.uid}</code></td><td>{card.memberName ?? 'Unassigned'}</td><td><span className="status">{card.status}</span></td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No NFC cards registered" />}</Panel>{show&&<CardModal onClose={()=>setShow(false)} onSaved={()=>{setShow(false);result.reload()}}/>}</>;
}
function CardModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){const members=useLoad(()=>adminApi.members());const[error,setError]=useState('');const[created,setCreated]=useState<{portalUrl:string;uid:string}|null>(null);const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{setCreated(await adminApi.assignCard(String(d.get('memberId')),String(d.get('uid'))))}catch(c){setError(c instanceof Error?c.message:'Card assignment failed')}};if(created)return <Modal title="Card assigned" onClose={onSaved}><div className="credential-box"><strong>Write this URL to the NTAG215 card now</strong><span className="break-all">{created.portalUrl}</span><span>UID: {created.uid}</span></div><p>This complete URL is shown only once. Test both the R80C UID scan and the phone tap before handing over the card.</p><div className="modal-actions"><button className="button primary" onClick={onSaved}>Verified and saved</button></div></Modal>;return <Modal title="Assign NFC card" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Member<PremiumSelect name="memberId" required placeholder="Choose a member" options={(members.data?.items??[]).map(m=>({value:m.id,label:`${m.fullName} · ${m.memberNumber}`}))}/></label><label className="full-row">Card UID<input name="uid" required autoFocus placeholder="Tap the card on the R80C reader"/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Assign card</button></div></form></Modal>}
function WalkInsPage() {
  const result = useLoad(adminApi.walkIns);
  const[show,setShow]=useState(false);
  return <><PageHeader title="Walk-in Management" subtitle="Record cash visits, recognize returning guests and preserve conversion history." icon={<UserPlus />} action={<button className="button primary" onClick={()=>setShow(true)}><UserPlus />New walk-in</button>} /><div className="notice"><PhilippinePeso />The default fee is configured by the API. Ordinary walk-ins do not receive permanent NFC cards.</div><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Visitor</th><th>Total visits</th><th>Last visit</th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td><strong>{item.fullName}</strong></td><td>{item.visits}</td><td>{new Date(item.lastVisitAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No walk-in visits recorded" />}</Panel>{show&&<WalkInModal profiles={result.data?.items??[]} onClose={()=>setShow(false)} onSaved={()=>{setShow(false);result.reload()}}/>}</>;
}
function WalkInModal({profiles,onClose,onSaved}:{profiles:Array<{id:string;fullName:string}>;onClose:()=>void;onSaved:()=>void}){const[returning,setReturning]=useState('');const[error,setError]=useState('');const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();const d=new FormData(e.currentTarget);try{await adminApi.recordWalkIn({firstName:String(d.get('firstName')||'Returning'),lastName:String(d.get('lastName')||'Guest'),phone:String(d.get('phone')||'')||undefined,profileId:returning||undefined,amountReceived:Number(d.get('amountReceived')),notes:String(d.get('notes')||'')||undefined});onSaved()}catch(c){setError(c instanceof Error?c.message:'Could not record walk-in')}};return <Modal title="Record walk-in" onClose={onClose}><form className="form-grid" onSubmit={submit}><label className="full-row">Returning guest (optional)<PremiumSelect value={returning} onChange={setReturning} placeholder="Choose a returning guest or leave blank" options={[{value:'',label:'New walk-in guest'},...profiles.map(p=>({value:p.id,label:p.fullName}))]}/></label>{!returning&&<><label>First name<input name="firstName" placeholder="Enter first name" autoComplete="given-name" autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required/></label><label>Last name<input name="lastName" placeholder="Enter last name" autoComplete="family-name" autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required/></label><label className="full-row">Phone<input name="phone" placeholder="e.g. 0917 123 4567" inputMode="tel" autoComplete="tel"/></label></>}<label>Cash received<input name="amountReceived" type="number" min="0" step="0.01" placeholder="Enter amount received" inputMode="decimal" required/></label><label>Notes<input name="notes" placeholder="Add a counter note (optional)"/></label>{error&&<div className="form-error full-row">{error}</div>}<div className="modal-actions full-row"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary">Record payment & visit</button></div></form></Modal>}
function PaymentsPage() {
  const result = useLoad(adminApi.payments);
  return <><PageHeader title="Cash Payments" subtitle="Authoritative over-the-counter transactions and receipt references." icon={<PhilippinePeso />} /><Panel>{result.data?.items.length ? <div className="table-wrap"><table><thead><tr><th>Reference</th><th>Payer</th><th>Type</th><th>Amount</th><th>Received</th></tr></thead><tbody>{result.data.items.map((item) => <tr key={item.id}><td>{item.reference}</td><td>{item.payerName}</td><td>{item.type}</td><td>₱{item.amount.toLocaleString()}</td><td>{new Date(item.receivedAt).toLocaleString()}</td></tr>)}</tbody></table></div> : <ConnectionState {...result} reload={result.reload} empty="No cash payments recorded" />}</Panel></>;
}
function StandardPage({ title, subtitle, icon, endpoint }: { title: string; subtitle: string; icon: ReactNode; endpoint: string }) { return <><PageHeader title={title} subtitle={subtitle} icon={icon} /><Panel><div className="state"><Activity /><strong>Ready for the 3.0 API</strong><span>{endpoint}</span></div></Panel></>; }
function Modal({ title, children, onClose, className = '' }: { title: string; children: ReactNode; onClose: () => void; className?: string }) { return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button onClick={onClose} aria-label="Close"><X /></button></div>{children}</div></div>; }

function Login({ onLogin }: { onLogin: (user: AdminUser) => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [passwordVisible, setPasswordVisible] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { onLogin(await authApi.login(username, password)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Sign in failed'); } finally { setBusy(false); } };
  return <main className="login-page"><section className="login-visual"><img src="/logo.png" alt="X-TRIM FIT GYM" /><div><span className="eyebrow">ADMIN OPERATIONS</span><h1>Train hard.<br />Manage smarter.</h1><p>Membership, attendance and revenue under one accountable system.</p></div></section><section className="login-form"><div><span className="eyebrow">SECURE ADMIN PORTAL</span><h2>Welcome back</h2><p>Use your authorized administrator account.</p><form onSubmit={submit}><label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" placeholder="Username" required /></label><label>Password<div className="password-input"><input type={passwordVisible ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Password" required /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? 'Hide password' : 'Show password'} aria-pressed={passwordVisible}>{passwordVisible ? <EyeOff /> : <Eye />}</button></div></label>{error && <div className="form-error">{error}</div>}<button className="button primary full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button></form><small className="login-note">Accounts are created by the system owner. No public sign-up.</small></div></section></main>;
}

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
    authApi.me().then((user) => setAuth({ loading: false, user })).catch(() => setAuth({ loading: false }));
  }, []);
  const logout = useCallback(async () => { try { await authApi.logout(); } finally { setAuth({ loading: false }); navigate('/login'); } }, [navigate]);
  if (auth.loading) return <div className="boot"><img src="/logo.png" alt="X-TRIM FIT GYM" /><span>Securing admin portal…</span></div>;
  if (!auth.user) return <Routes><Route path="*" element={<Login onLogin={(user) => { setAuth({ loading: false, user }); navigate('/dashboard'); }} />} /></Routes>;
  if (auth.user.mustChangePassword) return <FirstPassword user={auth.user} onComplete={(user) => { setAuth({ loading: false, user }); navigate('/dashboard'); }} />;
  return <Shell user={auth.user} onLogout={logout} onUserChange={(user) => setAuth({ loading: false, user })} />;
}
