import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Ban, CalendarClock, Check, ChevronLeft, ChevronRight, CreditCard, Edit3, FileCheck2, History, KeyRound, Pause, Play, RefreshCw, ShieldAlert, UserRound, WalletCards, X } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { adminApi, authApi, type AdminUser, type MemberDetail, type MemberServiceRequest, type MembershipRecord, type MemberType, type Plan } from './api';
import { capitalizeNameParts, formatMobileNumber, PremiumDatePicker, PremiumSelect, ReasonSelect } from './FormControls';
import './member.css';

type Dialog = 'edit' | 'renew' | 'pause' | 'resume' | 'cancel' | 'status' | 'reset' | 'dates' | 'request' | null;
const money = (value: number) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value);
const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not recorded';
const dateTime = (value?: string) => value ? new Date(value).toLocaleString('en-PH') : 'Not recorded';
const inputDate = (value: string) => new Date(value).toISOString().slice(0, 10);
const localDateKey = (value: Date | string) => {
  const day = new Date(value);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
};
const relationshipOptions = ['Parent', 'Spouse or partner', 'Sibling', 'Guardian', 'Relative', 'Friend', 'Other'].map((label) => ({ value: label, label }));
const membershipReasons = {
  pause: ['Medical or health recovery', 'Travel or temporary absence', 'Personal schedule conflict', 'Financial considerations'],
  resume: ['Member returned and requested reactivation', 'Pause period completed', 'Cleared to resume membership', 'Administrative correction'],
  cancel: ['Member requested cancellation', 'Relocated or no longer attending', 'Health or medical reason', 'Membership changed or replaced'],
};
const disableReasons = ['Policy or conduct issue', 'Account security concern', 'Duplicate member account', 'Member requested account closure'];
const enableReasons = ['Issue resolved', 'Account ownership verified', 'Reactivated by the gym owner', 'Administrative correction'];
const dateCorrectionReasons = ['Data-entry error', 'Incorrect membership start date', 'Incorrect membership expiry date', 'Approved membership adjustment', 'System migration correction'];

type RequestResolution = { value: 'APPROVE' | 'DECLINE'; label: string; note: string };

const requestResolutions = (type: MemberServiceRequest['type']): RequestResolution[] => {
  if (type === 'RENEWAL') return [
    {
      value: 'APPROVE',
      label: 'Visit reception to complete payment',
      note: 'Please visit X-TRIM FIT GYM reception to complete your payment and membership renewal.',
    },
    {
      value: 'DECLINE',
      label: 'Unable to process right now',
      note: 'We are sorry, but we cannot process your membership renewal request right now. Please contact reception if you need assistance.',
    },
  ];

  if (type === 'PROFILE_CORRECTION') return [
    {
      value: 'APPROVE',
      label: 'Approve and apply the changes',
      note: 'Your requested profile changes have been reviewed and applied to your account.',
    },
    {
      value: 'DECLINE',
      label: 'Unable to approve the changes',
      note: 'We are sorry, but we cannot approve the requested profile changes right now. Please visit reception with a valid ID for assistance.',
    },
  ];

  return [
    {
      value: 'APPROVE',
      label: 'Visit reception for card support',
      note: 'Your lost-card report has been reviewed. Please visit X-TRIM FIT GYM reception for NFC card assistance.',
    },
    {
      value: 'DECLINE',
      label: 'Unable to proceed right now',
      note: 'We are sorry, but we cannot proceed with this NFC card request right now. Please contact reception if you need assistance.',
    },
  ];
};

function DialogFrame({ title, children, close, className = '' }: { title: string; children: ReactNode; close: () => void; className?: string }) {
  return <div className="modal-backdrop" onMouseDown={close}><section className={`modal member-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><header className="modal-head"><h2>{title}</h2><button onClick={close} aria-label="Close"><X /></button></header>{children}</section></div>;
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
  const [targetRequest, setTargetRequest] = useState<MemberServiceRequest>();
  const [busy, setBusy] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string }>();
  const [showAttendanceCalendar, setShowAttendanceCalendar] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [renewalPlanId, setRenewalPlanId] = useState('');
  const [renewalCash, setRenewalCash] = useState('');

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
  const selectedRenewalPlan = plans.find((plan) => plan._id === renewalPlanId);
  const renewalTotal = (selectedRenewalPlan?.price ?? 0) + activationFee;
  const renewalReceived = Number(renewalCash || 0);
  const renewalChange = Math.max(0, renewalReceived - renewalTotal);
  const open = (next: Dialog, membership?: MembershipRecord) => { setError(''); setCredentials(undefined); setTarget(membership); if (next === 'renew') { setRenewalPlanId(current?.planId ?? ''); setRenewalCash(''); } setDialog(next); };
  const openRequest = (request: MemberServiceRequest) => { setError(''); setTargetRequest(request); setDialog('request'); };

  return <div className="member-page">
    <Link to="/members" className="member-back"><ArrowLeft />Back to members</Link>
    <header className="member-hero">
      <div className="member-monogram">{member.firstName[0]}{member.lastName[0]}</div>
      <div className="member-title"><span>{member.memberNumber}</span><h1>{member.firstName} {member.lastName}</h1><p>Member since {date(member.createdAt)} · Login: {account?.username ?? 'Not created'}</p></div>
      <div className="member-hero-actions"><button className="button secondary" onClick={() => open('edit')}><Edit3 />Edit profile</button><button className="button secondary" onClick={() => open('reset')}><KeyRound />Reset password</button><button className={`button ${member.status === 'ACTIVE' ? 'danger' : 'primary'}`} onClick={() => open('status')}>{member.status === 'ACTIVE' ? 'Disable member' : 'Enable member'}</button></div>
    </header>
    {notice && <div className="member-notice success">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss"><X /></button></div>}
    {error && !dialog && <div className="member-notice error">{error}</div>}

    <div className="member-summary">
      <article><UserRound /><span>Contact</span><strong>{member.phone ? formatMobileNumber(member.phone) : 'No phone number'}</strong><small>{member.email || 'No email address'}</small></article>
      <article><WalletCards /><span>Current membership</span><strong>{current?.planName ?? 'No open membership'}</strong><small>{current ? `${current.status} · until ${date(current.expiresAt)}` : 'Renew to activate access'}</small></article>
      <article><CreditCard /><span>NFC card</span><strong>{detail.cards.find((row) => row.status === 'ACTIVE')?.uid ?? 'Not assigned'}</strong><small>{detail.cards.length ? `${detail.cards.length} card record(s)` : 'Assign after activation'}</small></article>
      <button type="button" className="member-summary-card attendance-summary-card" onClick={() => { setAttendanceMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); setShowAttendanceCalendar(true); }} aria-label="Open attendance calendar"><History /><span>Attendance</span><strong>{detail.attendance.length}</strong><small>Latest: {dateTime(detail.attendance[0]?.recordedAt)}</small><em>View calendar</em></button>
    </div>

    {detail.requests.some((request) => request.status === 'OPEN') && <section className="panel member-section member-request-section"><div className="member-section-head"><div><h2>Member requests</h2><p>Requests submitted from the Member portal require an explicit Admin resolution.</p></div><span className="record-state paused">{detail.requests.filter((request) => request.status === 'OPEN').length} OPEN</span></div><div className="compact-list">{detail.requests.filter((request) => request.status === 'OPEN').map((request) => <button type="button" className="member-request-row" key={request.id} onClick={() => openRequest(request)}><FileCheck2/><span><strong>{request.type.replaceAll('_', ' ')}</strong><small>{request.message} · {dateTime(request.createdAt)}</small></span><span>Review<ChevronRight/></span></button>)}</div></section>}

    <section className="panel member-section">
      <div className="member-section-head"><div><h2>Membership lifecycle</h2><p>Renewals, holds and cancellations are recorded with their operational history.</p></div><button className="button primary" onClick={() => open('renew')}><RefreshCw />{current ? 'Renew membership' : 'Activate membership'}</button></div>
      {detail.memberships.length ? <div className="table-wrap"><table><thead><tr><th>Plan</th><th>Term</th><th>Status</th><th>Reason / note</th><th>Actions</th></tr></thead><tbody>{detail.memberships.map((row) => <tr key={row.id}><td><strong>{row.planName}</strong><small>{money(row.pricePaid)}</small></td><td>{date(row.startsAt)}<small>to {date(row.expiresAt)}</small></td><td><span className={`record-state ${row.status.toLowerCase()}`}>{row.status}</span></td><td>{row.statusReason || '—'}</td><td><div className="row-actions membership-row-actions">{row.status === 'ACTIVE' && <button type="button" aria-label="Pause membership" title="Pause membership" onClick={() => open('pause', row)}><Pause /></button>}{row.status === 'PAUSED' && <button type="button" aria-label="Resume membership" title="Resume membership" onClick={() => open('resume', row)}><Play /></button>}{(row.status === 'ACTIVE' || row.status === 'PAUSED') && <button type="button" className="warning" aria-label="Cancel membership" title="Cancel membership" onClick={() => open('cancel', row)}><Ban /></button>}{viewer?.role === 'OWNER' && row.status !== 'PAUSED' && <button type="button" aria-label="Correct membership dates" title="Correct membership dates" onClick={() => open('dates', row)}><CalendarClock /></button>}</div></td></tr>)}</tbody></table></div> : <div className="member-empty">No membership record yet.</div>}
    </section>

    <div className="member-history-grid">
      <section className="panel member-section"><div className="member-section-head"><div><h2>Cash payments</h2><p>Completed over-the-counter membership transactions.</p></div></div>{detail.payments.length ? <div className="compact-list">{detail.payments.map((row) => <div key={row.id}><span><strong>{row.reference}</strong><small>{row.type} · {dateTime(row.receivedAt)}</small></span><span><strong>{money(row.amountDue)}</strong><small>Cash {money(row.amountReceived)} · Change {money(row.change)}</small></span></div>)}</div> : <div className="member-empty">No payment history.</div>}</section>
      <section className="panel member-section"><div className="member-section-head"><div><h2>Attendance history</h2><p>Verified daily check-in and check-out sessions.</p></div></div>{detail.attendance.length ? <div className="compact-list">{detail.attendance.map((row) => <div key={row.id}><span><strong>{dateTime(row.recordedAt)} – {row.status === 'VISIT RECORDED' ? 'checkout not tracked' : row.checkedOutAt ? dateTime(row.checkedOutAt) : 'currently inside'}</strong><small>{row.stationId}</small></span><span className={`record-state ${row.status === 'CHECKED IN' ? 'active' : ''}`}>{row.status}</span></div>)}</div> : <div className="member-empty">No attendance recorded.</div>}</section>
    </div>

    {dialog === 'edit' && <DialogFrame title="Edit member profile" close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const type = String(data.get('memberType')) as MemberType; void execute(() => adminApi.updateMember(memberId, { firstName: String(data.get('firstName')), lastName: String(data.get('lastName')), phone: String(data.get('phone') || '') || undefined, email: String(data.get('email') || '') || undefined, birthDate: String(data.get('birthDate') || '') || null, memberType: type, studentIdVerified: type === 'STUDENT' && data.get('studentIdVerified') === 'on', emergencyContact: { name: String(data.get('emergencyName')), relationship: String(data.get('emergencyRelationship')), phone: String(data.get('emergencyPhone')) } }), 'Member profile updated.'); }}><label>First name<input name="firstName" placeholder="Enter first name" defaultValue={member.firstName} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Last name<input name="lastName" placeholder="Enter last name" defaultValue={member.lastName} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Mobile number<input name="phone" placeholder="09XX XXX XXXX" inputMode="numeric" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" defaultValue={formatMobileNumber(member.phone)} onInput={(event)=>{event.currentTarget.value=formatMobileNumber(event.currentTarget.value)}} required /></label><label>Email<input name="email" type="email" placeholder="name@email.com" defaultValue={member.email} /></label><label>Birth date<PremiumDatePicker name="birthDate" placeholder="Select birth date" defaultValue={member.birthDate ? inputDate(member.birthDate) : ''} max={inputDate(new Date().toISOString())} variant="wheel" /></label><label>Member type<PremiumSelect name="memberType" defaultValue={member.memberType} required options={[{ value: 'REGULAR', label: 'Regular member' }, { value: 'STUDENT', label: 'Student member' }]} placeholder="Choose member type" /></label><label className="full-row verification-check"><input name="studentIdVerified" type="checkbox" defaultChecked={member.studentIdVerified} /><span><strong>Student ID verified</strong><small>Required when saving this member as a student.</small></span></label><label>Emergency contact name<input name="emergencyName" placeholder="Enter full name" defaultValue={member.emergencyContact?.name ?? ''} autoCapitalize="words" onInput={(event)=>{event.currentTarget.value=capitalizeNameParts(event.currentTarget.value)}} required /></label><label>Relationship<PremiumSelect name="emergencyRelationship" defaultValue={member.emergencyContact?.relationship ?? ''} required placement="up" placeholder="Choose relationship" options={relationshipOptions} /></label><label>Emergency mobile number<input name="emergencyPhone" placeholder="09XX XXX XXXX" inputMode="numeric" maxLength={13} pattern="09\d{2} \d{3} \d{4}" title="Enter an 11-digit Philippine mobile number" defaultValue={formatMobileNumber(member.emergencyContact?.phone ?? '')} onInput={(event)=>{event.currentTarget.value=formatMobileNumber(event.currentTarget.value)}} required /></label><Actions close={() => setDialog(null)} busy={busy} label="Save changes" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'renew' && <DialogFrame title={current ? 'Renew membership' : 'Activate membership'} className="renewal-dialog" close={() => setDialog(null)}><form className="form-grid renewal-form" onSubmit={(event) => { event.preventDefault(); if (!selectedRenewalPlan) { setError('Choose a membership plan.'); return; } if (renewalReceived < renewalTotal) { setError(`Cash received must be at least ${money(renewalTotal)}.`); return; } const data = new FormData(event.currentTarget); void execute(() => adminApi.renewMembership(memberId, { planId: selectedRenewalPlan._id, amountReceived: renewalReceived, notes: String(data.get('notes') || '') || undefined }), 'Membership and cash payment recorded.'); }}><p className="full-row member-dialog-copy">{current ? 'The renewal will extend the current membership using the same plan. Receive the payment and confirm the change before recording it.' : `${member.memberType === 'STUDENT' ? 'Verified student' : 'Regular'} pricing is applied. Confirm the counter payment before activating access.`}</p><label className="full-row">Membership plan<PremiumSelect value={renewalPlanId} onChange={(value) => { setRenewalPlanId(value); setRenewalCash(''); setError(''); }} required placeholder="Choose a membership plan" options={availablePlans.map((plan) => ({ value: plan._id, label: `${plan.name} · ${money(plan.price + activationFee)} total · ${plan.durationDays} days${plan.isPromo ? ' · Promo' : ''}` }))} /></label><section className="pos-panel renewal-payment-panel full-row"><div className="pos-order"><span>Selected plan</span><strong>{selectedRenewalPlan?.name ?? 'Choose a membership plan'}</strong><dl><div><dt>Plan price</dt><dd>{selectedRenewalPlan ? money(selectedRenewalPlan.price) : '—'}</dd></div><div><dt>{activationFee ? 'First membership fee' : 'Additional fees'}</dt><dd>{money(activationFee)}</dd></div><div><dt>Payment method</dt><dd>Cash</dd></div></dl><div className="pos-total"><span>Total due</span><strong>{selectedRenewalPlan ? money(renewalTotal) : '—'}</strong></div></div><div className="pos-tender"><label>Cash received<div className={`currency-input${renewalCash ? ' has-value' : ''}`}>{renewalCash && <span aria-hidden="true">₱</span>}<input type="number" min={renewalTotal} step="0.01" placeholder="Enter cash received" inputMode="decimal" value={renewalCash} onChange={(event) => { setRenewalCash(event.target.value); setError(''); }} autoFocus required /></div></label><div className={`change-display ${renewalCash && renewalReceived >= renewalTotal ? 'ready' : ''}`}><span>Change</span><strong>{selectedRenewalPlan && renewalCash && renewalReceived >= renewalTotal ? money(renewalChange) : '—'}</strong><small>{renewalCash && renewalReceived < renewalTotal ? `Still due: ${money(renewalTotal - renewalReceived)}` : 'Confirm this amount before recording the renewal.'}</small></div></div></section><label className="full-row">Receipt note (optional)<input name="notes" placeholder="Add a short note for this transaction" maxLength={500} /></label>{error && <div className="form-error full-row">{error}</div>}<Actions close={() => setDialog(null)} busy={busy} disabled={!selectedRenewalPlan || renewalReceived < renewalTotal} label="Record payment and renewal" /></form></DialogFrame>}

    {(dialog === 'pause' || dialog === 'resume' || dialog === 'cancel') && target && <DialogFrame title={`${dialog[0].toUpperCase()}${dialog.slice(1)} membership?`} close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); const completed = dialog === 'pause' ? 'paused' : dialog === 'resume' ? 'resumed' : 'cancelled'; void execute(() => adminApi.membershipAction(memberId, target.id, dialog, reason), `Membership ${completed}.`); }}><p className="full-row member-dialog-copy">This changes member access immediately and keeps the existing record for audit history.</p><label className="full-row">Reason<ReasonSelect options={membershipReasons[dialog]} placeholder={`Choose why this membership is being ${dialog === 'pause' ? 'paused' : dialog === 'resume' ? 'resumed' : 'cancelled'}`} /></label><Actions close={() => setDialog(null)} busy={busy} label={`${dialog[0].toUpperCase()}${dialog.slice(1)} membership`} danger={dialog === 'cancel'} />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'status' && <DialogFrame title={`${member.status === 'ACTIVE' ? 'Disable' : 'Enable'} member?`} close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get('reason')); const status = member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'; void execute(() => adminApi.setMemberStatus(memberId, status, reason), `Member account ${status === 'ACTIVE' ? 'enabled' : 'disabled'}.`); }}><div className="full-row dialog-warning"><ShieldAlert /><p>{member.status === 'ACTIVE' ? 'The member will be blocked from the portal and NFC attendance. Membership and payment history will remain intact.' : 'The member account and NFC eligibility will be restored, subject to an active membership.'}</p></div><label className="full-row">Reason<ReasonSelect options={member.status === 'ACTIVE' ? disableReasons : enableReasons} placeholder={`Choose why this member is being ${member.status === 'ACTIVE' ? 'disabled' : 'enabled'}`} /></label><Actions close={() => setDialog(null)} busy={busy} label={member.status === 'ACTIVE' ? 'Disable member' : 'Enable member'} danger={member.status === 'ACTIVE'} />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'reset' && <DialogFrame title="Reset member password" close={() => setDialog(null)}>{credentials ? <><div className="credential-box"><strong>Give these credentials to the member once</strong><span>Username: {credentials.username}</span><span>Temporary password: {credentials.temporaryPassword}</span></div><p>The member must replace this password on their next sign-in. Existing sessions have been revoked.</p><div className="modal-actions"><button className="button primary" onClick={() => { setDialog(null); setCredentials(undefined); }}>Done</button></div></> : <><p>Generate a one-time temporary password and sign the member out from all current devices?</p>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button className="button secondary" onClick={() => setDialog(null)}>Cancel</button><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setCredentials(await adminApi.resetMemberPassword(memberId)); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not reset password.'); } finally { setBusy(false); } }}>Generate password</button></div></>}</DialogFrame>}

    {dialog === 'dates' && target && <DialogFrame title="Correct membership dates" close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const data = new FormData(event.currentTarget); void execute(() => adminApi.correctMembershipDates(memberId, target.id, { startsAt: String(data.get('startsAt')), expiresAt: String(data.get('expiresAt')), reason: String(data.get('reason')) }), 'Membership dates corrected.'); }}><p className="full-row member-dialog-copy">Owner-only correction for data-entry mistakes. This action is written to the audit log.</p><label>Start date<PremiumDatePicker name="startsAt" placeholder="Select start date" defaultValue={inputDate(target.startsAt)} required /></label><label>Expiry date<PremiumDatePicker name="expiresAt" placeholder="Select expiry date" defaultValue={inputDate(target.expiresAt)} required /></label><label className="full-row">Correction reason<ReasonSelect options={dateCorrectionReasons} placeholder="Choose why these dates need correction" placement="up" /></label><Actions close={() => setDialog(null)} busy={busy} label="Save correction" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {dialog === 'request' && targetRequest && <DialogFrame title="Resolve member request" close={() => setDialog(null)}><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const selected = requestResolutions(targetRequest.type).find((option) => option.value === String(new FormData(event.currentTarget).get('resolution'))); if (!selected) return; void execute(() => adminApi.resolveMemberRequest(memberId, targetRequest.id, selected.value, selected.note), 'Response sent to the member.'); }}><div className="full-row member-request-review"><span className="record-state paused">{targetRequest.type.replaceAll('_', ' ')}</span><p>{targetRequest.message}</p>{targetRequest.requestedChanges && <dl>{Object.entries(targetRequest.requestedChanges).filter(([, value]) => value !== undefined).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>}</div><label className="full-row">Response to member<PremiumSelect name="resolution" defaultValue="APPROVE" options={requestResolutions(targetRequest.type)} placeholder="Choose a response" /></label><Actions close={() => setDialog(null)} busy={busy} label="Send response" />{error && <div className="form-error full-row">{error}</div>}</form></DialogFrame>}

    {showAttendanceCalendar && <AttendanceCalendar memberSince={member.createdAt} records={detail.attendance} month={attendanceMonth} setMonth={setAttendanceMonth} close={() => setShowAttendanceCalendar(false)} />}
  </div>;
}

function AttendanceCalendar({ memberSince, records, month, setMonth, close }: { memberSince: string; records: MemberDetail['attendance']; month: Date; setMonth: (value: Date) => void; close: () => void }) {
  const today = new Date();
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const recorded = new Map<string, MemberDetail['attendance']>();
  for (const row of records) {
    const key = localDateKey(row.recordedAt);
    recorded.set(key, [...(recorded.get(key) ?? []), row]);
  }
  const cells: Array<Date | null> = Array.from({ length: firstDay.getDay() }, () => null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canMoveNext = nextMonth <= new Date(today.getFullYear(), today.getMonth(), 1);
  return <DialogFrame title="Attendance calendar" close={close}>
    <div className="attendance-calendar">
      <header><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month"><ChevronLeft /></button><strong>{month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</strong><button type="button" onClick={() => canMoveNext && setMonth(nextMonth)} disabled={!canMoveNext} aria-label="Next month"><ChevronRight /></button></header>
      <div className="attendance-weekdays">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="attendance-days">{cells.map((day, index) => {
        if (!day) return <span className="attendance-day empty" key={`empty-${index}`} />;
        const key = localDateKey(day);
        const visits = recorded.get(key) ?? [];
        const isFuture = day > new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const beforeMembership = day < new Date(new Date(memberSince).getFullYear(), new Date(memberSince).getMonth(), new Date(memberSince).getDate());
        const state = isFuture || beforeMembership ? 'neutral' : visits.length ? 'recorded' : 'none';
        const visitTitle = visits.length ? visits.map((row) => new Date(row.recordedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })).join(', ') : state === 'none' ? 'No visit recorded' : 'Outside tracked dates';
        return <span className={`attendance-day ${state}`} key={key} title={visitTitle}><b>{day.getDate()}</b>{state === 'recorded' ? <Check /> : state === 'none' ? <X /> : null}</span>;
      })}</div>
      <div className="attendance-legend"><span><i className="recorded"><Check /></i>Attendance recorded</span><span><i className="none"><X /></i>No visit recorded</span></div>
      <p>Days without a record are not treated as absences; they only indicate that no gym visit was logged.</p>
    </div>
  </DialogFrame>;
}

function Actions({ close, busy, label, danger = false, disabled = false }: { close: () => void; busy: boolean; label: string; danger?: boolean; disabled?: boolean }) {
  return <div className="modal-actions full-row"><button type="button" className="button secondary" onClick={close}>Cancel</button><button className={`button ${danger ? 'danger' : 'primary'}`} disabled={busy || disabled}>{busy ? 'Saving…' : label}</button></div>;
}
