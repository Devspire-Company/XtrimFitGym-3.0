# Member Portal Product Plan

Status: MVP implemented on October 12, 2026. This document now records the approved product decisions, delivered scope, and remaining validation work.

## Product direction

The Member portal should not be an admin dashboard with fewer permissions. It should answer the questions a member actually has:

1. Is my membership active, and when does it expire?
2. Did my gym check-in/check-out record correctly?
3. What did I pay for, and where is my receipt?
4. Is my NFC card active?
5. Is the gym open, and are there important updates?
6. How do I protect or update my account?

The recommended first release remains read-focused. Membership activation, cash collection, attendance correction, and NFC assignment stay under gym staff control.

## Recommended navigation

Use five primary destinations. Keep announcements and notifications out of the sidebar.

| Destination | Purpose | Release priority |
| --- | --- | --- |
| Home | Membership status, gym status, recent visit, card state, announcements, and important reminders | MVP |
| My Membership | Current plan, validity, membership history, NFC card details, and payment receipts | MVP |
| Attendance | Paginated check-in/check-out history and visit summaries | MVP |
| Coaches | Published coach directory with specialties and structured weekly availability | MVP, read-only |
| Account | Member information, password, active sessions, and sign-out controls | MVP |

This means the portal needs more than Dashboard and Attendance. However, separate pages for Payments, NFC, Announcements, and Notifications are unnecessary at first; those can be placed naturally within the five destinations above.

## 1. Home

Home should be a concise status screen, not a large analytics dashboard.

### Primary content

- Membership plan and status: Active, Paused, Expired, Cancelled, or No membership.
- Expiry date and a readable days-remaining message.
- Clear warning state when expiration is near.
- Gym status now and today's operating hours using the structured Manila schedule.
- Today's attendance state: Not checked in, Currently inside, or Checked out.
- Last completed visit.
- NFC card state: Active, Not assigned, Lost, Replaced, or Revoked.
- Visits this month.
- Latest active announcements when announcements are enabled.

### Header notifications

Add a notification bell beside the member name, matching the Admin notification interaction but using member-relevant events only:

- Membership expires soon.
- Membership expired, paused, resumed, renewed, or cancelled.
- NFC card assigned, reported lost, replaced, or revoked.
- Payment receipt issued or payment voided.
- Important gym announcement.
- Account security event such as password change or other sessions revoked.

Support unread count, open/read state, Mark all read, individual deletion, Clear read, and deep links. Do not notify members about internal audit, cash-closing, or other members' activity.

## 2. My Membership

Use one page with clear sections rather than separate sidebar pages.

### Current membership

- Plan name.
- Status.
- Start and expiry dates.
- Days remaining.
- Amount paid.
- Pause information when applicable.
- Status reason when the membership was paused, cancelled, corrected, or expired.

### Membership history

- Previous plans and renewals.
- Start and expiry dates.
- Final status.
- Paginated results rather than a fixed record cap.

### Payment receipts

- Membership and card-replacement payments belonging to the signed-in member.
- Reference number, date, amount, method, and status.
- Member-safe receipt modal.
- Thermal print and Save as PDF behavior consistent with Admin receipts.
- Voided payments remain visible and clearly labelled; internal admin-only notes and controls are excluded.

### NFC card

- Masked card identifier only, for example the final four characters.
- Current status and assignment date.
- Explanation that the gym reader records official attendance.
- Optional Report lost action only if the gym agrees to the workflow described under Product decisions.
- No ability to assign, reactivate, replace, or manually change a card from the Member portal.

## 3. Attendance

Attendance should represent a session with check-in and check-out, not a loose list of scans.

### Required content

- Today's current attendance state.
- Check-in time.
- Check-out time or Currently inside.
- Method displayed in member-friendly language: NFC card or Recorded by staff.
- Visit totals for this month and all time.
- Paginated history.
- Date-range or month filter.
- Clear corrected-record state if Admin attendance correction is added later.

### Integrity rules

- Members cannot check themselves in or out through the web app.
- Official attendance comes from the gym NFC station or an audited staff action.
- Members cannot edit or delete attendance.
- A future Report a problem action may submit a correction request, but it must not directly change the official record.

## 4. Coaches

Keep this directory only if the gym wants members to discover available coaches. The current backend already publishes coaches, so retaining it is useful and inexpensive.

### Required content

- Coach name.
- Profile image or consistent placeholder.
- Specialties as individual labels.
- Structured weekly availability with day and time cards.
- Active/published coaches only.
- A detail modal for the complete schedule.

Do not add session booking, coach messaging, client assignment, ratings, or payments until the gym defines the real operational workflow. A non-functional Book button would be misleading.

## 5. Account

### Member information

- Full name and member number.
- Phone and email.
- Birth date.
- Emergency contact.
- Member type: Regular or Student.

The recommended MVP makes identity fields read-only and gives members a Request correction action. Admin remains the authoritative editor so member identity, student eligibility, and emergency information cannot silently diverge from gym records.

### Security

- Change password with confirmation and password visibility controls.
- Password-strength requirements shown before submission.
- Active session/device list.
- Revoke all other sessions.
- Current username displayed.
- Clear sign-out action.

Do not allow a member to change their member number, membership status, plan, NFC status, eligibility, or username without a separately approved identity-verification flow.

## Implementation status

### Delivered

- Shared unified login and first-password flow.
- Premium responsive Member shell with five focused destinations.
- Home overview with membership, gym, attendance, visit, NFC, announcement, and request states.
- Paginated membership history and member-owned payments with safe receipt detail and thermal printing.
- Paginated, date-filtered attendance sessions with paired check-in/check-out semantics and method labels.
- Masked NFC lifecycle state and an audited lost-card flow that blocks the card immediately.
- Read-only coach directory with specialties and structured weekly schedules.
- Member profile, correction requests, password controls, active sessions, and revoke-other-session control.
- Persistent Member notification inbox with unread state, mark all read, deletion, clear-read, and deep links.
- Admin review and resolution of renewal, profile-correction, and lost-card requests.
- Membership, NFC, payment, announcement, and security lifecycle notification generation.
- Purpose-built modals, dropdowns, date controls, status cards, empty states, and mobile layouts instead of browser-default UI.

### Remaining verification and future enhancements

- Database-backed Member route integration tests should be added once the test database harness is available.
- Browser end-to-end coverage should be added for first login, receipts, requests, notification actions, and sessions.
- A final visual QA pass should be performed with realistic production-sized member histories and live mobile devices.
- Attendance correction requests, online payments, and coach booking remain intentionally outside this MVP.

## Required API contracts for the MVP

Exact route names may change during implementation, but the responsibilities should remain separated.

- `GET /member/home`: compact home status, today attendance, reminders, and announcements.
- `GET /member/memberships`: current membership plus paginated history.
- `GET /member/payments`: paginated member-owned receipts only.
- `GET /member/payments/:id`: member-safe receipt detail with ownership enforcement.
- `GET /member/attendance`: paginated and date-filtered attendance sessions.
- `GET /member/card`: masked active/latest card lifecycle state.
- `GET /member/profile`: member information safe for the member to view.
- `GET /member/coaches`: structured specialties and availability.
- Member notification endpoints equivalent to the safe parts of the Admin inbox.
- Existing shared Auth session and password endpoints can be reused.

Every record endpoint must derive the member ID from the authenticated session. The client must never be allowed to supply another member ID.

## Deliberately excluded from the first release

- Web/app attendance check-in or check-out.
- Online membership payment.
- Direct membership activation or renewal.
- Direct attendance editing.
- Direct NFC assignment or replacement.
- Coach booking and chat.
- Workout tracking, calorie tracking, and social/community feeds.
- Downloading data that belongs to another member.

These can be separate future projects. Adding them now would expand financial, scheduling, privacy, and abuse-prevention requirements significantly.

## Approved product decisions

### Decision 1: membership renewal — approved

Recommended: show expiration and a Contact reception / Request renewal action, but keep payment and activation at reception.

Alternative: purely read-only with no request action.

Do not add online payment until payment provider, refund, reconciliation, webhook, and failed-payment rules are designed.

### Decision 2: profile corrections — approved

Recommended: members view their complete profile and submit a correction request; Admin approves and applies it.

Alternative: phone, email, and emergency contact are directly editable while legal identity and student eligibility remain Admin-only.

### Decision 3: lost NFC card — approved

Recommended: allow Report card lost with a confirmation and reason. This immediately blocks future card attendance, creates an Admin notification, and requires Admin to issue the replacement.

Alternative: show reception instructions only and keep all card actions in Admin.

### Decision 4: coaches — approved

Recommended: retain a read-only coach directory with availability; no booking yet.

Alternative: remove Coaches from Member navigation until a booking workflow exists.

### Decision 5: announcements — approved

Recommended: show active announcements on Home only and surface important new announcements through the notification bell. Keep the existing Admin setting that hides announcements.

## Delivered build sequence

1. Freeze Member API response contracts and authorization rules.
2. Build profile, membership history, receipts, attendance pagination, and today's attendance state.
3. Add Member notifications and lifecycle event generation.
4. Redesign the shared Member shell, Home, Membership, Attendance, Coaches, and Account pages.
5. Add responsive, keyboard, focus, error, loading, and empty-state behavior.
6. Add API ownership/integration tests and browser tests for login, first password, membership, receipt, attendance, notifications, and security sessions.
7. Perform a privacy/security review before deployment.

## Recommended MVP acceptance criteria

- A member can understand membership validity, card state, gym status, and today's attendance within one screen.
- Attendance always shows paired check-in/check-out semantics and cannot be mutated by the member.
- A member can retrieve only their own membership history and receipts.
- Important membership, card, payment, announcement, and security events produce persistent notifications.
- Account password and session controls work end to end.
- All lists paginate; no silent 30/100-record caps remain.
- Mobile and desktop layouts remain readable without horizontal page overflow.
- Loading, empty, expired, paused, disabled, revoked-card, API-error, and offline states have intentional UI.
- Ownership checks are covered by automated API tests.
