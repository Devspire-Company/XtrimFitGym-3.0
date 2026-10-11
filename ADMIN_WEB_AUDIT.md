# XtrimFitGym 3.0 — Admin Web Audit

Audit date: 2026-10-11

Scope: Admin Web, shared authentication, admin API routes, database behavior, reporting, security, deployment, and test readiness.

Implementation update (2026-10-11): The repository now includes Manila-time utilities and boundary tests, structured weekly/special-date gym schedules, announcement publishing, owner-only payment voiding, printable receipt details, a searchable owner audit screen, member/payment pagination, payment filters, global expired-session redirects, and a React error boundary. Checked items below were verified in code and by the current type-check/build/test commands; unchecked items still need work or an explicit business/operations decision.

NFC note: NFC hardware/card improvements are intentionally tracked separately unless they affect a broader admin workflow.

## Executive verdict

The admin system is no longer a prototype. Its core operational flow is implemented end to end:

- owner/admin authentication and forced temporary-password replacement;
- member enrollment with an atomic membership and cash payment;
- member profile, membership lifecycle, attendance, walk-ins, coaches, plans, payments, and reports;
- owner-only administrator and attendance-station management;
- role checks, origin verification, secure cookies, rate-limited login, hashed passwords, and audit writes.

It is now ready for primary feature work to move to the member portal, but it is not yet production-complete. The largest remaining risks are missing database-backed transaction tests, attendance correction tooling, fixed limits in secondary collections, backup/monitoring readiness, and unresolved privacy/retention decisions.

Recommendation: proceed with the member portal against the now-stable schedule and announcement contracts while keeping the unchecked production-hardening items as a parallel release gate.

## Current module status

| Module | Status | Notes |
|---|---|---|
| Unified login and role routing | Implemented | One login routes owner/admin to `/admin/*` and members/coaches to `/portal/*`. |
| Dashboard | Implemented | KPI cards, alerts, shortcuts, collapsible activity, and Manila-time “today” summaries exist. |
| Members | Implemented, partly paginated | Enrollment, server-side search/status filtering, paginated directory, detail, classification edits, membership lifecycle, payments, and attendance history exist. Detail histories remain capped. |
| Membership plans | Implemented | Create, edit, archive, restore, and owner-only permanent deletion rules exist. |
| Membership lifecycle | Implemented | Activate, renew, pause, resume, cancel, and owner-only date correction exist. More route-level tests are needed. |
| Attendance | Implemented, incomplete administration | NFC and accountable manual attendance exist for members and coaches. The combined history now has server-side search, date/type/status filters, and pagination; owner correction and export remain pending. |
| Walk-ins | Implemented | New/return visits and cash payments are atomic, notes are preserved, and the directory has server-side search and pagination. |
| Cash payments | Accountable ledger implemented | Includes server-side filters/pagination, receipt detail/printing, and owner-only append-only voiding with linked-record resolution. Daily closing reconciliation remains external/undocumented. |
| Coaches | Implemented | Profile, specialties, availability, account, status, password reset, and attendance exist. Admin cannot inspect a full per-coach attendance history or correct a mistake. |
| Reports | Implemented, needs export options | 7/30/90-day Manila-time summaries exist, overdue memberships normalize first, and voided payments are excluded. No custom range or export exists. |
| Settings | Implemented | Fees, structured weekly hours, special dates, status override, an exact server-derived Member Home preview, stations, sessions, and administrator accounts exist. |
| Audit records | Implemented, needs refinement | Owner-only searchable/date-filtered paginated history includes actor, metadata, target, reasons, Manila timestamps, and filtered CSV export. Friendlier target labels remain incomplete where older metadata contains only an ID. |
| Announcements | Implemented | Admin draft/publish/archive/delete workflow and scheduled member-facing publication are implemented and audited. |
| Automated tests | Improved but insufficient | Nineteen unit/security/time-boundary tests pass, but database-backed route tests, frontend tests, and end-to-end workflows are still missing. |
| Deployment/operations | Partially documented | Health/readiness endpoints and shutdown handling exist. CI, monitoring, backup/restore verification, and incident procedures are absent from the repository. |

## P0 — Complete before using real production data

### 1. Add accountable payment correction and receipt workflows

Implementation evidence:

- Owner-only voiding preserves the original payment and records the actor, reason, timestamp, and linked-record resolution.
- Cash Payments now has server-side filters, pagination, full receipt detail, and print styling.
- End-of-day cash closing and database-backed correction tests remain unfinished.

Required work:

- [x] Add owner-authorized payment void/correction with a mandatory reason.
- [x] Never delete payment records; preserve original amounts, actor, time, and correction link.
- [x] Reverse or explicitly resolve the related membership/visit effect where appropriate.
- [x] Add a receipt-detail view containing amount due, cash received, change, notes, collector, and timestamp.
- [x] Add print/download support for a customer receipt.
- [ ] Add daily cash closing totals or explicitly document that reconciliation happens outside the system.
- [ ] Add integration tests proving that corrections cannot silently alter history.

### 2. Fix date, timezone, and expiry consistency

Implementation evidence:

- Dashboard, reports, payments, attendance dates, and member monthly summaries now share the Asia/Manila utility.
- Reports normalize overdue memberships before grouping stored statuses.
- Boundary coverage includes Manila midnight, month/year rollover, and leap day.

Required work:

- [x] Use a single Asia/Manila date utility for dashboard, reports, payments, member summaries, and attendance.
- [x] Normalize overdue memberships before any status summary, or derive effective status without mutating on read.
- [x] Add boundary tests for midnight, month-end, leap day, and UTC/Manila date differences.

### 3. Make configured gym hours authoritative

Implementation evidence:

- Settings now store seven structured weekday schedules plus special-date exceptions.
- Member Home derives both status and displayed hours from that schedule and honors manual overrides.
- A dedicated in-settings preview is still pending.

Required work:

- [x] Replace the free-text-only model with structured weekly opening hours.
- [x] Support closed days and temporary/holiday overrides.
- [x] Derive `Open now` and displayed hours from the same stored schedule.
- [x] Add an admin preview showing exactly what members will see.

### 4. Add integration coverage for critical transactions

Current tests cover helpers and middleware behavior but do not execute complete API workflows against a database.

Required work:

- [ ] Test enrollment transaction rollback and duplicate submissions.
- [ ] Test renewal concurrency and prevent accidental double extension/payment.
- [ ] Test pause/resume/cancel authorization and state transitions.
- [ ] Test walk-in uniqueness and payment atomicity.
- [ ] Test member and coach attendance permissions and duplicate handling.
- [ ] Test OWNER versus ADMIN permissions for every sensitive route.
- [ ] Test login, forced-password change, session revocation, and disabled accounts.
- [ ] Add at least one browser-level smoke test covering login → enrollment → payment → attendance.

### 5. Establish backup, restore, and production monitoring

The repository has health/readiness endpoints, but no verifiable operational recovery plan.

- [ ] Confirm automated MongoDB backups and retention.
- [ ] Perform and document a restore drill using a non-production database.
- [ ] Add structured request/error logging with secret and personal-data redaction.
- [ ] Add uptime/error alerts for the API and database connectivity.
- [ ] Document owner account recovery and secret rotation.

## P1 — Finish before calling the admin system feature-complete

### 6. Build a full audit-log screen

Audit records already exist, but the UI exposes only eight recent records with raw target identifiers.

- [x] Add an owner-facing Audit Log page.
- [ ] Show actor name, readable action, target name/reference, reason, metadata, and Manila timestamp.
- [ ] Filter by actor, action, target type, and date range.
- [x] Paginate results and support CSV export.
- [x] Keep audit entries append-only.

### 7. Add server-side pagination, filtering, and sorting

Remaining fixed limits:

- member payments/attendance: 100 each;
- portal attendance: 100;
- coach attendance: 30;
- attendance combines limited member and coach queries.

The primary member directory and payment ledger now return page metadata and use server-side pagination. Other growing collections and search selectors still need migration.

Consequences include incomplete lists and an incomplete manual-attendance member selector after the gym grows.

- [ ] Add cursor or page-based pagination to all growing collections.
- [ ] Return total/result metadata.
- [ ] Add server-side filters for status, date, person type, plan, and payment type.
- [ ] Update selectors to search the API instead of loading the first 100 members.
- [ ] Avoid returning an unbounded NFC-card collection.

### 8. Complete payment and report usability

- [x] Add payment search by reference or payer.
- [x] Add date and payment-type filters.
- [x] Show collector, cash received, change, and notes in payment details.
- [ ] Add custom report ranges and CSV/PDF export.
- [x] Rename “Revenue” to “Cash collected” unless expenses, refunds, and accrual rules are added.
- [x] Clearly exclude voided payments from every summary.

### 9. Complete attendance administration

- [x] Add date/person/status filters and pagination.
- [ ] Add owner-only correction/void for mistaken attendance with a mandatory reason.
- [x] Add a per-coach attendance history in the admin UI.
- [x] Require a reason for manual coach check-in/check-out, matching manual member accountability.
- [ ] Decide whether members record visits only or true check-in/check-out; label the UI consistently.
- [ ] Add export for payroll or attendance review if coach attendance will be used operationally.

### 10. Complete member data administration

Confirmed gaps:

- API supports changing `memberType` and student verification, but Edit Member does not expose them.
- `photoUrl` and enrollment-consent fields exist in the model but have no working admin flow.
- Enrollment audit metadata explicitly says agreements are handled on paper outside the system.

Required decisions/work:

- [x] Allow authorized correction of Regular/Student classification and verification status with audit history.
- [ ] Decide whether member photos are required; either implement secure storage/capture or remove the unused field.
- [ ] Decide whether waivers/privacy consent stay on paper or become digital.
- [ ] If digital, store consent version, timestamps, actor, and an immutable document reference.
- [ ] Define retention, anonymization, and deletion procedures for personal data.

### 11. Fix confirmed walk-in note loss

Walk-in notes are now submitted with the visit payment and are visible in the payment receipt. A route-level regression test is still needed.

- [x] Send the entered note to the API.
- [x] Display it in payment/visit details.
- [ ] Add a regression test.

### 12. Add announcement management before finishing Member Home

The member overview now returns only announcements whose publication window is currently active. Admin supports draft, publish, edit, archive, and owner-only draft deletion.

- [x] Add an Announcement model and admin CRUD/publish/archive workflow.
- [x] Support publish start/end dates and active/inactive state.
- [x] Return only currently published announcements to members.
- [x] Sanitize content and keep publication actions in the audit log.

### 13. Improve expired-session and failure handling

- [x] Redirect to `/login` globally when an API call returns 401.
- [ ] Handle forced-password and forbidden errors consistently.
- [x] Add a React error boundary for unexpected rendering failures.
- [ ] Prevent duplicate financial submissions with server-side idempotency keys, not only disabled buttons.
- [ ] Add retry guidance without encouraging duplicate payments.

## P2 — Valuable improvements after stabilization

- [ ] Add optional two-factor authentication for owner/admin accounts.
- [ ] Add a secure self-service recovery policy or clearly retain owner-assisted recovery.
- [ ] Add granular staff permissions if not every administrator should manage cash, members, plans, and coaches.
- [ ] Add real-time or periodic refresh for dashboard and attendance screens.
- [ ] Add accessible modal focus trapping, Escape-to-close, and focus restoration.
- [ ] Add frontend component tests and accessibility checks.
- [x] Add CI that runs type checks, tests, and production builds on every change.
- [ ] Make the Render API rewrite configurable instead of hardcoding one deployment URL.
- [ ] Define whether coach availability is informational only or will support booking/session scheduling.
- [ ] Define whether payment methods will remain cash-only or later include GCash/card/bank payments.

## Known NFC workstream

NFC remains a separate project track, but these admin dependencies are still known:

- member-card revoke/replace actions are not exposed from the central NFC table;
- assigned member portal URLs are one-time readable and require a documented encode-and-test procedure;
- real R80C and phone-tap hardware acceptance tests are not automated;
- existing cards must use the unified domain or the old domain must redirect to it.

## Recommended order before Member Web expansion

### Stabilization batch

1. Fix Manila timezone, expiry normalization, and automatic gym hours.
2. Fix walk-in note submission.
3. Add payment receipt/detail plus owner-only void/correction.
4. Add the full audit-log screen.
5. Add pagination/search contracts for members, attendance, walk-ins, payments, and cards.
6. Add critical API integration tests and one end-to-end admin workflow.

### Member-contract batch

1. Add structured gym schedule endpoints.
2. Add announcement management and publication endpoints.
3. Finalize membership effective-status rules.
4. Decide photo, consent, personal-data retention, and account recovery scope.
5. Freeze the member API response shapes before redesigning the member pages.

### Member Web batch

After those contracts are stable, continue with Member Home, Membership, Attendance, Coaches, and Account screens without needing to redesign the backend repeatedly.

## Definition of “admin ready enough to move on”

The admin side is ready for primary focus to move to Member Web when all of the following are true:

- [ ] P0 date/time, payment correction, critical tests, and backup/monitoring items are complete.
- [x] Audit logs are searchable outside the dashboard preview.
- [ ] Growing record lists are paginated.
- [x] Gym schedule and announcements have stable member-facing contracts.
- [x] Cash receipts and corrections preserve an accountable trail.
- [ ] One staging test completes enrollment, payment, attendance, renewal, coach attendance, report verification, and account authorization.

## Evidence reviewed

- `Admin Web/src/App.tsx`
- `Admin Web/src/MemberDetailPage.tsx`
- `Admin Web/src/SettingsPage.tsx`
- `Admin Web/src/api.ts`
- `Admin Web/src/portal/App.tsx`
- `Admin Web/src/portal/api.ts`
- `Admin Web/vercel.json`
- `Api/src/app.ts`
- `Api/src/config.ts`
- `Api/src/middleware.ts`
- `Api/src/models.ts`
- `Api/src/routes/admin.ts`
- `Api/src/routes/auth.ts`
- `Api/src/routes/member.ts`
- `Api/src/routes/coach.ts`
- `Api/tests/*.test.ts`
