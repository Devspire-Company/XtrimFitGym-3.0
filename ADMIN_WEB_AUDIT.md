# XtrimFitGym 3.0 Admin Readiness Audit

Audit date: 2026-10-12

Scope: Admin Web, shared authentication, admin API, database rules, notifications, deployment configuration, automated verification, and the API contracts needed before expanding the Member and Coach portals.

## Executive verdict

The admin application is functionally strong and no longer a prototype. Its main workflows are implemented: authentication, enrollment, memberships, payments, attendance, walk-ins, coaches, NFC cards, reporting, settings, audit history, announcements, and notifications.

Primary product work can move to the Member and Coach portals after one short admin stabilization batch. The remaining UI work is mostly operational tooling rather than another redesign.

The admin application is not yet production-complete. The main release risks are date-filter correctness, incomplete NFC lifecycle controls, missing attendance correction, financial request idempotency, and the lack of database-backed integration and browser tests.

## Current status by area

| Area | Status | Current position |
|---|---|---|
| Unified authentication | Ready | One login routes OWNER/ADMIN/MEMBER/COACH correctly and forces temporary-password replacement. |
| Dashboard | Ready | KPI cards, attention items, shortcuts, and collapsed activity are implemented. |
| Members | Ready with scale limits | Enrollment, editing, classification, lifecycle actions, payments, attendance, status, and password reset work. Detail histories are capped at 100. |
| Membership plans | Ready | Create, edit, archive, restore, eligibility, promo state, and guarded deletion are implemented. |
| Attendance | Functional, needs correction tools | Member and coach check-in/check-out work through NFC and manual fallback. Filters and pagination exist. Mistaken records cannot be corrected or voided. |
| Walk-ins | Functional | First and repeat visits, payments, notes, search, and pagination work. Walk-in-to-member conversion exists in the API but not the UI. |
| NFC cards | Functional, incomplete management | Member and coach assignment and backend revocation work. The main NFC page has no revoke/replace action, search, filters, or pagination. |
| Cash payments | Admin-ready | Search, filters, pagination, receipts, thermal printing, owner-only voiding, and owner-only daily cash closing are implemented. A closed Manila business day rejects new and voided payments until its closing is voided with a reason. |
| Coaches | Admin-ready | Card-style directory, detail/edit modal, availability, account controls, NFC, manual attendance, and attendance history exist. Coach attendance data needs a schema correction noted below. |
| Reports | Admin-ready | 7/30/90-day presets, validated custom ranges up to 366 days, visualizations, exact-data CSV export, and print/save-PDF output are implemented. |
| Audit log | Good | Owner-only search, date filters, pagination, readable metadata, and CSV export exist. |
| Announcements | Optional and complete | Draft/publish/archive workflow exists. Settings can hide it from the sidebar and Member Home without deleting records. |
| Notifications | Implemented, newly added | Persistent unread state, read-all, delete, clear-read, operational alerts, security alerts, polling, and deep links exist. Integration tests are still missing. |
| Settings | Ready | Profile, security, sessions, fees, schedule, exceptions, announcements toggle, stations, admin accounts, and audit log are implemented. |
| CI | Ready | GitHub Actions installs, type-checks, tests the API, and builds the web app. |
| Production operations | Repository-ready; deployment activation required | Health/readiness and protected metrics endpoints, redacted structured logs, tracked migrations, backup/restore-verification commands, Render configuration, and an operations/incident runbook exist. Host alerts, Atlas alerts, retention, and the first restore drill must be activated and recorded with production credentials. |

## Stabilization batch before moving primary focus

These are the remaining items worth completing before the Member and Coach portals become the main workstream.

### 1. Correct Manila date filtering

Priority: high

Attendance uses Manila day boundaries correctly. Payment and audit filters currently parse `YYYY-MM-DD` with `z.coerce.date()`, which produces UTC boundaries. Records between midnight and 8:00 AM Manila can fall into the wrong selected day.

- [ ] Change payment `from` and `to` filters to Manila day bounds.
- [ ] Change audit `from` and `to` filters to Manila day bounds.
- [ ] Add boundary tests covering records before 8:00 AM Manila.

### 2. Preserve complete coach attendance history

Priority: high

Member attendance stores check-in and check-out methods/reasons separately. Coach attendance has only one `method` and one `reason`. A manual check-in followed by another checkout method can overwrite the original context.

- [ ] Add separate coach check-in/check-out method fields.
- [ ] Add separate coach check-in/check-out reason fields.
- [ ] Preserve the original station and actor details.
- [ ] Update admin and coach portal responses to display both sides accurately.

### 3. Finish the NFC lifecycle UI and API scaling

Priority: high

The API can revoke member and coach cards, but the central NFC Card Management page only displays cards and assigns new ones.

- [ ] Add revoke, lost, and replace actions to every active card.
- [ ] Require a reason and show the action in the audit log.
- [ ] Add search, assignee-type/status filters, and pagination.
- [ ] Replace the assignment modal's first-100-member selector with API-backed search.
- [ ] Guarantee UID uniqueness across member and coach cards atomically. Separate collections currently allow a theoretical cross-collection race.
- [ ] Document and test the NTAG215 encode-and-phone-tap handoff.

### 4. Prevent duplicate financial commands

Priority: high

Buttons disable during requests, and MongoDB transactions protect partial writes, but the API has no idempotency key. A retry of a successful renewal can extend a membership twice and create two payments.

- [ ] Accept and persist idempotency keys for enrollment, renewal, and walk-in payment commands.
- [ ] Return the original result when the same command is retried.
- [ ] Add concurrency and retry tests.

### 5. Add accountable attendance correction

Priority: medium-high

- [ ] Add owner-only void/correction for mistaken member attendance.
- [ ] Add owner-only void/correction for mistaken coach attendance.
- [ ] Require a reason and preserve the original record.
- [ ] Decide whether coach attendance needs CSV export for payroll or review.

### 6. Add critical database and browser tests

Priority: high for production; not a UI blocker

The current 19 tests cover helpers, password hashing, middleware behavior, membership calculations, and Manila time. They do not execute real API workflows against MongoDB.

- [ ] Enrollment rollback and duplicate-submission tests.
- [ ] Renewal concurrency and idempotency tests.
- [ ] Walk-in visit/payment atomicity tests.
- [ ] Member and coach check-in/check-out tests.
- [ ] OWNER versus ADMIN authorization matrix tests.
- [ ] Notification lifecycle tests.
- [ ] Login, forced-password, session revocation, and disabled-account tests.
- [ ] One browser smoke test: login -> enroll -> payment -> card -> attendance -> receipt.

## Backend and API improvements after stabilization

These can run in parallel with Member and Coach UI development.

### Growing collections

- [ ] Paginate member detail payments and attendance instead of returning only the latest 100.
- [ ] Paginate Member portal attendance instead of returning only the latest 100.
- [ ] Paginate Coach portal attendance instead of returning only the latest 30.
- [ ] Paginate announcements instead of capping the admin list at 200.
- [ ] Add search/pagination to the coach directory if the staff list grows.

### Cash operations

- [x] End-of-day cash closing happens inside the system and is owner-only.
- [x] Store opening cash, expected cash, counted cash, variance, closer, timestamp, and notes; block payment mutations after close and preserve voided closings.
- [x] Add CSV/PDF report output and a validated custom date range.

### Walk-in lifecycle

- [ ] Add a "Convert to member" action that prefills enrollment and sends `sourceWalkInProfileId`.
- [ ] Show conversion state/history in the walk-in directory.
- [ ] Add a controlled profile-correction workflow for misspelled names or contact details.

### Contract stability

- [ ] Define shared or generated API schemas instead of manually duplicating TypeScript response types in the web app.
- [ ] Add contract tests for Member and Coach overview responses.
- [ ] Return stable error codes for important business errors instead of relying primarily on message text.
- [ ] Version contracts before substantially expanding portal features.

### Data governance and operations

- [ ] Decide whether member photos are needed; implement secure storage or remove `photoUrl`.
- [ ] Confirm paper-only consent policy or implement immutable digital consent records.
- [ ] Define personal-data retention, anonymization, and account-closure procedures.
- [ ] Activate automated MongoDB backup retention and record the first restore drill using the implemented backup/verification commands.
- [x] Add structured request/error logging with request IDs and secret redaction.
- [ ] Connect the implemented readiness/metrics endpoints and Atlas signals to production alert destinations.
- [x] Add an explicit tracked database migration and index-deployment procedure.
- [x] Document incident response, owner recovery, and secret rotation in `OPERATIONS_RUNBOOK.md`.

## Remaining admin UI enhancement work

No entire admin tab is still visually untouched. The major screens all have custom layouts and intentional states. Remaining work is targeted:

- [ ] NFC Cards: lifecycle actions, filters, pagination, and searchable assignment.
- [ ] Attendance: correction UI and optional export.
- [ ] Walk-ins: member-conversion action and profile corrections.
- [x] Reports: custom range and CSV/PDF export controls.
- [ ] Members: paginated payment/attendance history instead of capped detail data.
- [ ] Modals: focus trapping, Escape-to-close, focus restoration, and consistent destructive-action keyboard behavior.
- [ ] Responsive QA for wide tables at tablet and small-laptop sizes.
- [ ] Frontend component tests and automated accessibility checks.

## Member and Coach portal contract gaps

These are not admin blockers, but they should shape the next phase.

### Member

- Current endpoints cover overview, membership/card state, attendance, published coaches, announcements, and password changes.
- Attendance is capped at 100 and has no pagination contract.
- There is no member profile/contact endpoint beyond `/auth/me` identity data.
- Decide whether contact corrections are self-service or admin-only.
- Decide whether members only view memberships or can submit renewal/contact requests.

### Coach

- The coach API currently exposes only one overview endpoint.
- Structured availability is flattened into display text.
- Attendance is capped at 30.
- Gym hours use the legacy `hoursToday` field instead of the structured Manila schedule and should be corrected.
- Decide whether coaches can edit their own profile/availability or only view admin-managed data.
- Decide whether future session booking/client assignments are in scope; current availability is informational only.

## Recommended execution order

1. Fix Manila payment/audit date filters.
2. Fix coach attendance method/reason preservation.
3. Finish NFC lifecycle actions and searchable selectors.
4. Add renewal/payment idempotency.
5. Add attendance correction.
6. Add the first database-backed workflow tests.
7. Freeze Member and Coach response contracts.
8. Move primary UI work to Member, then Coach.
9. Complete backups, monitoring, retention, and broader test coverage before production launch.

## Move-forward decision

Recommended decision: **yes, move toward Member and Coach after the short stabilization batch above.**

Do not spend another broad redesign cycle on the admin interface. Its visual system is consistent enough, cash closing and report exports are implemented, and the repository-side production toolchain is ready. Complete the remaining correctness work, accessibility polish, external alert setup, and first recorded restore drill as focused hardening work.

## Verification performed

- API type-check: passed.
- Admin Web type-check: passed.
- API tests: 21/21 passed, including cash-closing calculation and currency-rounding coverage.
- Unified web production build: passed.
- Git diff whitespace check: passed.

## Evidence reviewed

- `Admin Web/src/App.tsx`
- `Admin Web/src/MemberDetailPage.tsx`
- `Admin Web/src/SettingsPage.tsx`
- `Admin Web/src/FormControls.tsx`
- `Admin Web/src/api.ts`
- `Admin Web/src/portal/App.tsx`
- `Admin Web/src/portal/api.ts`
- `Admin Web/vercel.json`
- `Admin Web/public/sw.js`
- `Api/src/app.ts`
- `Api/src/config.ts`
- `Api/src/middleware.ts`
- `Api/src/models.ts`
- `Api/src/notifications.ts`
- `Api/src/routes/admin.ts`
- `Api/src/routes/auth.ts`
- `Api/src/routes/member.ts`
- `Api/src/routes/coach.ts`
- `Api/tests/*.test.ts`
- `.github/workflows/ci.yml`
