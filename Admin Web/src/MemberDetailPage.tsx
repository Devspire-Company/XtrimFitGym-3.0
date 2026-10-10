import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, CalendarClock, CreditCard, Edit3, History, KeyRound, Pause, Play, RefreshCw, ShieldAlert, UserRound, WalletCards, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { adminApi, authApi, type AdminUser, type MemberDetail, type MembershipRecord, type Plan } from './api';
import { capitalizeNameParts, formatMobileNumber, PremiumDatePicker, PremiumSelect } from './FormControls';
import './member.css';

type Dialog = 'edit' | 'renew' | 'pause' | 'resume' | 'cancel' | 'status' | 'reset' | 'dates' | null;
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not recorded';
const dateTime = (value?: string) => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded';
const inputDate = (value: string) => new Date(value).toISOString().slice(0, 10);
const relationshipOptions = ['Parent', 'Spouse or partner', 'Sibling', 'Guardian', 'Relative', 'Friend', 'Other'].map((label) => ({ value: label, label }));

function DialogFrame({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  return <div className="modal-backdrop" onMouseDown={close}><section className="modal member-dialog" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header className="modal-head"><h2>{title}</h2><button onClick={close} aria-label="Close"><X /></button></header>{children}</section></div>;
}

export default function MemberDetailPage() {
  const { memberId = '' } = useParams();
  const [detail, setDetail] = useState<MemberDetail>();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [firstMembershipFee, setFirstMembershipFee] = useState(100);
  const [viewer, setViewer] = useState<AdminUser>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [target, setTarget] = useState<MembershipRecord>();
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string }>();

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [record, planList, current] = await Promise.all([adminApi.member(memberId), adminApi.plans(), authApi.me()]);
      setDetail(record); setPlans(planList.items); setFirstMembershipFee(planList.firstMembershipFee); setViewer(current);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load the member record.'); }
    finally { setLoading(false); }
  }, [memberId]);
  useEffect(() => { void load(); }, [load]);

  const execute = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError('');
    try { await work(); setDialog(null); setTarget(undefined); setNotice(success); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The change could not be saved.'); }
    finally { setBusy(false); }
  };

  if (loading && !detail) return <section className="panel member-state"><RefreshCw className="spin" /><strong>Loading member record</strong></section>;
  if (!detail) return <section className="panel member-state error"><strong>Member record unavailable</strong><span>{error}</span><Link className="button secondary" to="/members">Back to members</Link></section>;
  const { member, account } = detail;
  const current = detail.memberships.find((row) => row.status === 'ACTIVE' || row.status === 'PAUSED');
  const availablePlans = plans.filter((plan) => plan.isActive && (!current || plan._id === current.planId) && (plan.eligibility === 'ALL' || plan.eligibility === member.memberType));
  const activationFee = detail.memberships.length ? 0 : firstMembershipFee;
  const open = (next: Dialog, membership?: MembershipRecord) => { setError(''); setCredentials(undefined); setTarget(membership); setDialog(next); };

  return <div className="member-page">
    <Link to="/members" className="member-back"><ArrowLeft />Back to members</Link>
    <header className="member-hero">
      <div className="member-monogram">{member.firstName[0]}{member.lastName[0]}</div>
      <div className="member-title"><span>{member.memberNumber}</span><h1>{member.firstName} {member.lastName}</h1><p>Member since {date(member.createdAt)} · Login: {account?.username ?? 'Not created'}</p></div>
      <div className="member-hero-actions"><span className={`record-state ${member.status.toLowerCase()}`}>{member.status}</span><button className="button secondary" onClick={() => open('edit')}><Edit3 />Edit profile</button><button className="button secondary" onClick={() => open('reset')}><KeyRound />Reset password</button><button className={`button ${member.status === 'ACTIVE' ? 'danger' : 'primary'}`} onClick={() => open('status')}>{member.status === 'ACTIVE' ? 'Disable member' : 'Enable member'}</button></div>
    </header>
    {notice && <div className="member-notice success">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X /></button></div>}
    {error && !dialog && <div className="member-notice error">{error}</div>}

    <div className="member-summary">
      <article><UserRound /><span>Contact</span><strong>{member.phone ? formatMobileNumber(member.phone) : 'No phone number'}</strong><small>{member.email || 'No email address'}</small></article>
      <article><WalletCards /><span>Current membership</span><strong>{current?.planName ?? 'No open membership'}</strong><small>{current ? `${current.status} · until ${date(current.expiresAt)}` : 'Renew to activate access'}</small></article>
      <article><CreditCard /><span>NFC card</span><strong>{detail.cards.find((row) => row.status === 'ACTIVE')?.uid ?? 'Not assigned'}</strong><small>{detail.cards.length ? `${detail.cards.length} card record(s)` : 'Assign after activation'}</small></article>
      <article><History /><span>Attendance</span><strong>{detail.attendance.length}</strong><small>Latest: {dateTime(detail.attendance[0]?.recordedAt)}</small></article>
    </div>

    <section className="panel member-section">
      <div className="member-section-head"><div><h2>Membership lifecycle</h2><p>Renewals, holds and cancellations are recorded with their operational history.</p></div><button className="button primary" onClick={() => open('renew')}><RefreshCw />{current ? 'Renew membership' : 'Activate membership'}</button></div>
      {detail.memberships.length ? <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Term</th><th>Status</th><th>Reason / note</th><th>Actions</th></tr></thead><tbody>{detail.memberships.map((row) => <tr key={row.id}><td><strong>{row.planName}</strong><small>{money(row.pricePaid)}</small></td><td>{date(row.startsAt)}<small>to {date(row.expiresAt)}</small></td><td><span className={`record-state ${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.statusReason || '—'}</td><td><div className="row-actions">{row.status === 'ACTIVE' && <button onClick={() => open('pause', row)}><Pause />Pause</button>}{row.status === 'PAUSED' && <button onClick={() => open('resume', row)}><Play />Resume</button>}{(row.status === 'ACTIVE' || row.status === 'PAUSED') && <button className="warning" onClick={() => open('cancel', row)}>Cancel</button>}{viewer?.role === 'OWNER' && row.status !== 'PAUSED' && <button onClick={() => open('dates', row)}><CalendarClock />Correct dates</button>}</div></td></tr>)}</tbody></table></div> : <div className="member-empty">No membership record yet.</div>}
    </section>

    <div className="member-history-grid">
      <section className="panel member-section"><div className="member-section-head"><div><h2>Cash payments</h2><p>Completed over-the-counter membership transactions.</p></div></div>{detail.payments.length ? <div className="compact-list">{detail.payments.map((row) => <div key={row.id}><span><strong>{row.reference}</strong><small>{row.type} · {dateTime(row.receivedAt)}</small></span><span><strong>{money(row.amountDue)}</strong><small>Cash {money(row.amountReceived)} · Change {money(row.change)}</small></span></div>)}</div> : <div className="member-empty">No payment history.</div>}</section>
      <section className="panel member-section"><div className="member-section-head"><div><h2>Attendance history</h2><p>Latest verified NFC station activity.</p></div></div>{detail.attendance.length ? <div className="compact-list">{detail.attendance.map((row) => <div key={row.id}><span><strong>{dateTime(row.recordedAt)}</strong><small>{row.stationId}</small></span><span className="record-state active">{row.status}</span></div>)}</div> : <div className="member-empty">No attendance recorded.</div>}</section>
    </div>

    {dialog === 'edit' && <DialogFrame title="Edit member profile" close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void execute(() => adminApi.updateMember(memberId, { firstName: String(data.get('firstName')), lastName: String(data.get('lastName')), phone: String(data.get('phone') || '') || undefined, email: String(data.get('email') || '') || undefined, birthDate: String(data.get('birthDate') || '') || null, emergencyContact: { name: String(data.get('emergencyName')), relationship: String(data.get('emergencyRelationship')), phone: String(data.get('emergencyPhone')) } }), 'Member profile updated.'); }}><label>First name<input name="firstName" placeholder="Enter first name" defaultValue={member.firstName} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Last name<input name="lastName" placeholder="Enter last name" defaultValue={member.lastName} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Mobile number<input name="phone" placeholder="09XX XXX XXXX" inputMode="numeric" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" defaultValue={formatMobileNumber(member.phone)} onInput={(event)=>{event.currentTarget.value=formatMobileNumber(event.currentTarget.value)}} required /></label><label>Email<input name="email" type="email" placeholder="name@email.com" defaultValue={member.email} /></label><label>Birth date<PremiumDatePicker name="birthDate" placeholder="Select birth date" defaultValue={member.birthDate ? inputDate(member.birthDate) : ''} max={inputDate(new Date().toISOString())} variant="wheel" /></label><label>Emergency contact name<input name="emergencyName" placeholder="Enter full name" defaultValue={member.emergencyContact?.name ?? ''} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Relationship<PremiumSelect name="emergencyRelationship" defaultValue={member.emergencyContact?.relationship ?? ''} required placement="up" placeholder="Choose relationship" options={relationshipOptions} /></label><label>Emergency mobile number<input name="emergencyPhone" placeholder="09XX XXX XXXX" inputMode="numeric" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" defaultValue={formatMobileNumber(member.emergencyContact?.phone ?? '')} onInput={(event)=>{event.currentTarget.value=formatMobileNumber(event.currentTarget.value)}} required /></label><Actions close={() => setDialog(null)} busy={busy} label="Save changes" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'renew' && <DialogFrame title={current ? 'Renew membership' : 'Activate membership'} close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void execute(() => adminApi.renewMembership(memberId, { planId: String(data.get('planId')), amountReceived: Number(data.get('amountReceived')), notes: String(data.get('notes') || '') || undefined }), 'Membership and cash payment recorded.'); }}><p className="full-row member-dialog-copy">{current ? 'An open membership can only be extended using its current plan. Cancel it first to switch plans.' : `${member.memberType === 'STUDENT' ? 'Verified student' : 'Regular'} pricing is applied. The one-time membership fee is charged only if this is the member’s first plan.`}</p><label className="full-row">Membership plan<PremiumSelect name="planId" defaultValue={current?.planId ?? ''} required placeholder="Choose a membership plan" options={availablePlans.map((plan) => ({ value: plan._id, label: `${plan.name} · ${money(plan.price + activationFee)} total · ${plan.durationDays} days${plan.isPromo ? ' · Promo' : ''}` }))} /></label>{activationFee>0&&<div className="full-row member-dialog-copy">First membership fee: {money(activationFee)}. It will not be charged again on later renewals.</div>}<label>Cash received<input name="amountReceived" type="number" min="0" step="0.01" placeholder="Enter amount received" inputMode="decimal" required /></label><label>Receipt note<input name="notes" placeholder="Add a receipt note (optional)" /></label><Actions close={() => setDialog(null)} busy={busy} label="Record renewal" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {(dialog === 'pause' || dialog === 'resume' || dialog === 'cancel') && target && <DialogFrame title={`${dialog[0].toUpperCase()}${dialog.slice(1)} membership?`} close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); const completed = dialog === 'pause' ? 'paused' : dialog === 'resume' ? 'resumed' : 'cancelled'; void execute(() => adminApi.membershipAction(memberId, target.id, dialog, reason), `Membership ${completed}.`); }}><p className="full-row member-dialog-copy">This changes member access immediately and keeps the existing record for audit history.</p><label className="full-row">Reason<input name="reason" required minLength={3} placeholder="Enter the operational reason" /></label><Actions close={() => setDialog(null)} busy={busy} label={`${dialog[0].toUpperCase()}${dialog.slice(1)} membership`} danger={dialog === 'cancel'} />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'status' && <DialogFrame title={`${member.status === 'ACTIVE' ? 'Disable' : 'Enable'} member?`} close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); const status = member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'; void execute(() => adminApi.setMemberStatus(memberId, status, reason), `Member account ${status === 'ACTIVE' ? 'enabled' : 'disabled'}.`); }}><div className="full-row dialog-warning"><ShieldAlert /><p>{member.status === 'ACTIVE' ? 'The member will be blocked from the portal and NFC attendance. Membership and payment history will remain intact.' : 'The member account and NFC eligibility will be restored, subject to an active membership.'}</p></div><label className="full-row">Reason<input name="reason" placeholder="Enter the account status reason" required minLength={3} /></label><Actions close={() => setDialog(null)} busy={busy} label={member.status === 'ACTIVE' ? 'Disable member' : 'Enable member'} danger={member.status === 'ACTIVE'} />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'reset' && <DialogFrame title="Reset member password" close={() => setDialog(null)}>{credentials ? <><div className="credential-box"><strong>Give these credentials to the member once</strong><span>Username: {credentials.username}</span><span>Temporary password: {credentials.temporaryPassword}</span></div><p>The member must replace this password on their next sign-in. Existing sessions have been revoked.</p><div className="modal-actions"><button className="button primary" onClick={() => { setDialog(null); setCredentials(undefined); }}>Done</button></div></> : <><p>Generate a one-time temporary password and sign the member out from all current devices?</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setCredentials(await adminApi.resetMemberPassword(memberId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reset password.'); } finally { setBusy(false); } }}>Generate password</button></div></>}</DialogFrame>}

    {dialog === 'dates' && target && <DialogFrame title="Correct membership dates" close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void execute(() => adminApi.correctMembershipDates(memberId, target.id, { startsAt: String(data.get('startsAt')), expiresAt: String(data.get('expiresAt')), reason: String(data.get('reason')) }), 'Membership dates corrected.'); }}><p className="full-row member-dialog-copy">Owner-only correction for data-entry mistakes. This action is written to the audit log.</p><label>Start date<PremiumDatePicker name="startsAt" placeholder="Select start date" defaultValue={inputDate(target.startsAt)} required /></label><label>Expiry date<PremiumDatePicker name="expiresAt" placeholder="Select expiry date" defaultValue={inputDate(target.expiresAt)} required /></label><label className="full-row">Correction reason<input name="reason" placeholder="Explain why the dates are being corrected" required minLength={3} /></label><Actions close={() => setDialog(null)} busy={busy} label="Save correction" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}
  </div>;
}

function Actions({ close, busy, label, danger = false }: { close: () => void; busy: boolean; label: string; danger?: boolean }) {
  return <div className="modal-actions full-row"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy}>{busy ? 'Saving…' : label}</button></div>;
}
