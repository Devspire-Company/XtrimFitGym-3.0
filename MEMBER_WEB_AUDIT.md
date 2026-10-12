# Member Web Audit

**Audit date:** October 12, 2026  
**Scope:** Unified member web portal, Member API routes, shared authentication/session routes, member-facing notifications, and the Admin workflows that complete Member requests.  
**Implementation was not changed during this audit.**

## Executive assessment

The Member portal is a strong functional MVP, not an empty shell. Its main navigation, membership records, receipts, attendance sessions, NFC state, coaches, profile correction requests, renewal requests, notifications, password controls, and session controls are already connected to real APIs.

It is **not yet production-complete**. The most important remaining work is correctness and verification rather than adding more pages:

1. Member-facing membership status can become stale after expiry.
2. Paused membership time is displayed incorrectly.
3. Member routes and ownership rules have no database-backed integration tests.
4. Submitted requests do not have a proper member-facing status/history experience.
5. Several notification events promised by the product flow are not generated.
6. Member receipt printing does not explicitly set thermal paper size.

### Current status by area

| Area | Status | Assessment |
| --- | --- | --- |
| Member UI | Good MVP | All core pages exist and use the custom design system. Needs state, accessibility, refresh, and receipt refinements. |
| Member API | Functional | Ownership is server-derived and most lists paginate. Lifecycle truth and request/notification pagination need correction. |
| Backend security | Good foundation | HttpOnly sessions, role checks, origin verification, password hashing, login limiting, and no-store API responses exist. Route-level security tests are missing. |
| Member workflows | Mostly functional | Renewal, profile correction, lost card, attendance viewing, receipts, and security controls work. Request tracking and lifecycle messages are incomplete. |
| Automated verification | Incomplete | Existing 21 tests pass, but there are no Member route tests and no browser end-to-end tests. |

## What is already implemented

### Portal and navigation

- Unified sign-in routes Members and Coaches to the shared portal.
- Forced first-password replacement is implemented.
- Member navigation includes Home, My Membership, Attendance, Coaches, and Settings.
- Desktop and mobile navigation layouts exist.
- Logout confirmation is shared between Member and Coach and now follows the Admin interaction.
- A global React error boundary exists.
- The web app includes a manifest and network-first service worker.

### Home

- Current/latest membership summary and days remaining.
- Today's attendance state and latest visit.
- Total visits and visits this month.
- Current gym status and published hours.
- Masked NFC card status.
- Published announcements, controlled by the Admin announcement setting.

### Membership and payments

- Current/latest plan card.
- Paginated membership history.
- Paginated member-owned payment list.
- Ownership-protected receipt lookup.
- Member-safe receipt content without Admin void controls.
- Renewal request flow.
- NFC card state and immediate lost-card blocking flow.

### Attendance

- Paginated Member attendance sessions.
- Custom date-range controls.
- Paired check-in and check-out presentation.
- Member-friendly method labels for NFC and staff-recorded attendance.
- Members cannot alter official attendance from the portal.

### Coaches

- Active and published Coaches only.
- Specialty previews.
- Full structured availability in a custom modal.
- No misleading booking or chat controls.

### Settings and security

- Read-only personal information.
- Profile correction request.
- Password strength guidance and password confirmation.
- Change-password flow that revokes other sessions.
- Collapsible active sessions list.
- Revoke-other-sessions action.

### Notifications

- Unread count.
- Individual read state.
- Mark all as read.
- Individual deletion.
- Clear read notifications.
- Deep links to relevant portal pages.
- One-minute refresh while the portal is open.

### Existing backend safeguards

- Member identity is derived from the authenticated session; the client does not submit a Member ID for record reads.
- Payment receipt lookup includes both payment ID and authenticated Member ID.
- Member-only routes require a ready `MEMBER` account.
- State-changing requests require an allowed Origin and the custom CSRF header.
- Session cookies are HttpOnly, Secure in production, SameSite Lax, and scoped to `/`.
- Login attempts are rate-limited.
- API responses under `/v1` use `Cache-Control: no-store`.
- Lost-card mutation uses a database transaction and writes an audit event.
- Membership renewal/payment processing is completed by Admin and uses a transaction.

## Release blockers — P0

These should be completed before calling the Member portal production-ready.

### P0.1 — Make membership lifecycle state authoritative on Member routes

**Finding:** Expired active memberships are converted to `EXPIRED` only when certain Admin routes call `expireDueMemberships()`. Member `/home` and `/memberships` do not run the lifecycle update or derive an effective status.

**Current impact:** A Member can open the portal after expiry and still receive `status: ACTIVE`, even though the UI shows `0 days remaining`. Card and attendance eligibility may be evaluated differently from what the Member sees.

**Required revision:**

- Move expiry synchronization into a shared lifecycle service.
- Run it before Member home and membership responses, or calculate a single authoritative effective status everywhere.
- Ensure notifications and attendance eligibility use the same lifecycle source.
- Add tests for exact expiry time, Manila date boundaries, and repeat calls.

**Acceptance criteria:** An expired membership never appears Active in Member, Admin, NFC attendance, or notifications.

### P0.2 — Correct paused membership time presentation

**Finding:** The database stores `remainingMillisecondsAtPause`, but the Member API omits it. The Member UI calculates days remaining from `expiresAt` even while the membership is paused.

**Current impact:** The displayed remaining time continues shrinking while paused and can show zero even though time was preserved correctly in the backend.

**Required revision:**

- Return a safe `remainingDays` or `remainingMillisecondsAtPause` value.
- For `PAUSED`, show “X days preserved” and “Paused since …”.
- Do not present the old expiry as the final valid-until date while paused.
- Keep Active, Expired, and Cancelled copy distinct.

### P0.3 — Add Member API integration and ownership tests

**Finding:** All 21 existing API tests pass, but they cover helpers such as security primitives, Manila time, membership calculations, pricing, and cash closing. They do not exercise Member HTTP routes or MongoDB ownership filters.

**Required coverage:**

- A Member can retrieve their own profile, membership, receipts, attendance, card, requests, and notifications.
- A Member cannot retrieve another Member's receipt or data by changing an ID.
- Admin and Coach accounts cannot call Member-only endpoints.
- `mustChangePassword` accounts cannot access protected portal data.
- Lost-card reporting is atomic and cannot be submitted twice for the same active card.
- Duplicate open renewal and profile-correction requests return the intended conflict.
- Notification read/delete operations enforce recipient ownership.
- Invalid date ranges and malformed IDs return stable validation responses.
- Expired and paused membership edge cases match P0.1 and P0.2.

### P0.4 — Add critical browser end-to-end tests

At minimum, automate:

1. Unified Member login and redirect.
2. First-password replacement.
3. Home rendering for Active, Paused, Expired, and no-membership states.
4. Renewal request submission and duplicate prevention.
5. Lost-card confirmation and resulting blocked state.
6. Receipt opening and print layout.
7. Attendance filtering and pagination.
8. Notification read/delete/clear actions.
9. Password change and other-session revocation.
10. Logout confirmation and redirect.

## High-priority completion work — P1

### P1.1 — Give Members a clear request status/history section

The API returns up to 50 requests, but the UI uses them mainly to disable the Renewal and Profile Correction buttons. The Member cannot clearly review:

- what was submitted;
- when it was submitted;
- whether it is Pending, Completed, or Declined;
- the Admin response;
- what the Member should do next.

Add a compact “My requests” section inside My Membership and Settings rather than another sidebar item. Show only relevant fields and the member-facing resolution note. Paginate it instead of silently capping it at 50.

### P1.2 — Resolve the renewal-intent contradiction

The Member dropdown includes “I want to change to another plan,” but the renewal API stores only free text and the Admin renewal endpoint requires the same plan while an open membership exists.

Choose one accurate flow:

- **Recommended for now:** remove the change-plan reason and state that the request is for extending the current plan; plan changes must be handled at reception.
- **Future structured flow:** store requested plan ID, quote status, and expiration of the quote; Admin explicitly approves the plan switch before payment.

Do not treat a renewal request as a price reservation. The final price and eligibility should remain authoritative when reception records payment.

### P1.3 — Complete the notification event matrix

Currently implemented events include expiration warning, announcements, renewals, pause/resume/cancel/date changes, card assignment/loss/revocation, request resolution, password change, session revocation, and payment voiding.

Still needed or inconsistent:

- Membership actually expired.
- Initial membership activation and receipt issued.
- Non-renewal payment receipt issued, including card replacement.
- Member account disabled/restored where appropriate.
- Profile correction submitted confirmation.
- Renewal request submitted confirmation.
- Password reset follow-up after the Member signs in with the temporary password.

Create one documented event matrix with trigger, recipient, dedupe key, tone, deep link, and resolution rule.

### P1.4 — Paginate notifications

Notifications are silently limited to 40 records. Add cursor or page pagination and retain the unread count independently. The UI should load older items intentionally instead of hiding them.

### P1.5 — Refresh portal data after external changes

Notifications refresh every minute, but Home, Membership, attendance, card state, requests, and sessions can remain stale after Admin changes them.

Add safe refresh behavior when:

- the browser tab becomes visible;
- the window regains focus;
- a relevant notification is opened;
- a Member mutation finishes;
- the user explicitly selects Refresh where useful.

Avoid aggressive polling for all pages.

### P1.6 — Make asynchronous action failures visible

Several button handlers call APIs directly without a local error state, especially notification actions and session revocation. A failed request can result in an unhandled promise with no useful message.

Add consistent pending, success, and error feedback. Prevent duplicate clicks while a mutation is running.

### P1.7 — Finish Member receipt output

The receipt content is designed at `80mm`, but the Member portal print stylesheet does not declare an `@page` thermal size. Browser output can therefore remain a full default sheet with a narrow receipt positioned on it.

Required:

- Add an explicit thermal `@page` size and margin for physical receipt printing.
- Verify Chrome and Edge print output on the actual receipt printer.
- Keep print behavior separate from report PDF downloads.
- If “Download PDF” is offered later, generate a real receipt PDF directly rather than opening the print dialog.

### P1.8 — Standardize Manila timezone rendering

Many Member UI dates use the browser's local timezone. The backend already treats gym operations as Asia/Manila.

Use `timeZone: 'Asia/Manila'` consistently for attendance, payments, requests, membership dates, notifications, and sessions so travelers or devices with incorrect timezone settings do not see shifted records.

### P1.9 — Add mutation-specific rate limits

Login is rate-limited, but sensitive authenticated mutations should also have narrow limits:

- password change and first-password initialization;
- renewal/profile-correction request creation;
- lost-card reporting;
- public NFC portal-token recognition.

Keep limits high enough for normal use and return a friendly retry message.

## UI and experience enhancements — P2

### P2.1 — Improve modal accessibility

The custom modal focuses the dialog container and closes with Escape, but it does not trap focus or restore focus to the button that opened it.

Add:

- focus trap;
- initial focus on the safest useful control;
- focus restoration on close;
- locked background scroll;
- unique title IDs when multiple modal types exist.

### P2.2 — Improve notification popover behavior

- Close on outside click and Escape.
- Add suitable dialog/menu semantics.
- Move keyboard focus into the panel and restore it on close.
- Show loading/error states during read, delete, Mark all read, and Clear read.
- Consider an Undo toast for accidental deletion.

### P2.3 — Add explicit state-specific membership content

The same membership layout is used for all statuses. Provide intentional cards for:

- Active: days remaining and final valid date.
- Paused: preserved days, paused date, and reception guidance.
- Expired: expiry date and renewal action.
- Cancelled: cancellation date/reason and reception guidance.
- No membership: activation instructions.

### P2.4 — Surface request progress on Home

`openRequests` is returned by `/member/home` but is not presented. Add one compact “Pending request” item only when relevant. Do not turn Home into another large dashboard.

### P2.5 — Improve empty and partial-error isolation

My Membership starts four requests simultaneously. A failure in one section should not make an unrelated section appear empty or silently enable an action. Give Membership, Payments, NFC, and Requests their own clear loading/error/retry states.

### P2.6 — Add coach profile imagery only when real data exists

The Member model already contains `photoUrl`, but the public Coach response does not provide a photo field. If the gym will maintain Coach photos:

- add a validated managed image URL/upload flow;
- use a consistent fallback avatar;
- do not rely on arbitrary third-party image URLs.

If the gym will not maintain photos, keep the current premium placeholder.

### P2.7 — Complete responsive visual QA

Test real data at these widths and zoom levels:

- 320px, 360px, 390px, 768px, 1024px, 1366px, and 1920px;
- browser zoom at 125%, 150%, and 200%;
- long names, long plan names, long announcement text, and 10+ sessions;
- empty, loading, offline, error, expired, paused, disabled, lost-card, and voided-payment states.

Pay special attention to attendance rows, receipt modals, notification popovers, date pickers, and long Member numbers.

### P2.8 — Split the portal into maintainable modules

`portal/App.tsx` currently contains the shell, all Member pages, all Coach pages, modals, helpers, and first-password flow in a highly compressed file. This raises regression risk during continued UI revision.

Recommended structure:

```text
portal/
  shell/
  home/
  membership/
  attendance/
  coaches/
  settings/
  notifications/
  components/
```

This is a maintainability enhancement, not a reason to delay correctness fixes.

## Backend/API contract improvements

### Membership response

Add or clarify:

- `effectiveStatus` or guaranteed synchronized `status`;
- `remainingDays` for Active and Paused states;
- `pausedAt` and preserved duration;
- status change date and member-safe reason;
- an explicit `current` definition: latest record versus currently open membership.

### Requests response

Replace the fixed 50-record list with pagination:

```text
GET /member/requests?page=1&status=OPEN&type=RENEWAL
```

Return page, limit, total, pages, and items. Consider a Member cancellation endpoint only while a request is still Open and has not been acted on by reception.

### Notifications response

Add pagination or cursor parameters. Keep unread count global, not limited to the current page.

### Attendance response

The current contract is sound for check-in/check-out sessions. Future correction support should add a member-safe correction marker rather than allowing direct editing.

### Public NFC token route

The public recognition route reveals only whether a high-entropy token is active, which is a reasonable minimal response. Still add endpoint-specific rate limiting and retain generic error messages and `no-store` behavior.

## Security and privacy review

### Already good

- Password hashes are excluded by default and use bcrypt with a server pepper.
- Session tokens and NFC portal tokens are stored as one-way hashes.
- Member record ownership is derived server-side.
- Mutations are protected by Origin and custom-header checks.
- Sensitive API responses are not cached.
- Disabled accounts lose active access.

### Still required

- Automated authorization/ownership tests.
- Rate limits for sensitive authenticated mutations and public token recognition.
- Confirm production `ALLOWED_ORIGINS`, cookie security, proxy trust, and HTTPS behavior.
- Confirm logs never contain passwords, session cookies, raw NFC portal tokens, or complete NFC UIDs.
- Decide whether Members should be able to view recorded consent versions and privacy/waiver acceptance dates.
- Document retention for notifications, sessions, requests, and old Member records.

## Recommended implementation queue

### Phase 1 — Correctness and release safety

- [ ] Centralize automatic membership expiry and use it in Member routes.
- [ ] Correct paused membership remaining-time responses and UI.
- [ ] Add Member route integration/ownership tests.
- [ ] Add critical browser end-to-end tests.
- [ ] Verify production cookie, CORS, and origin configuration.

### Phase 2 — Complete existing workflows

- [ ] Add paginated My Requests UI and API.
- [ ] Remove or formally model the change-plan renewal option.
- [ ] Complete the Member notification event matrix.
- [ ] Paginate notifications.
- [ ] Add focus/visibility refresh behavior.
- [ ] Add reliable mutation feedback.
- [ ] Fix thermal receipt page sizing.
- [ ] Standardize Asia/Manila formatting.

### Phase 3 — UI hardening

- [ ] Add accessible modal focus handling.
- [ ] Improve notification keyboard/outside-click behavior.
- [ ] Create distinct Active, Paused, Expired, Cancelled, and empty membership presentations.
- [ ] Show pending requests compactly on Home.
- [ ] Run realistic mobile, desktop, zoom, and long-content visual QA.
- [ ] Split the portal into page/component modules.

### Phase 4 — Optional future products

- [ ] Attendance correction request workflow.
- [ ] Structured plan-change request.
- [ ] Online payments only after provider, webhook, reconciliation, refund, and failure rules are approved.
- [ ] Coach booking only after availability ownership, conflicts, cancellation, and payment rules are approved.
- [ ] Member data export or consent history if the gym approves the privacy workflow.

## Features that should remain excluded for now

- Member web check-in/check-out.
- Direct attendance editing or deletion.
- Direct NFC assignment, activation, or replacement.
- Direct membership activation without reception payment processing.
- Online payment without a complete reconciliation and refund design.
- Coach chat, ratings, and booking without an approved operational model.
- Workout, calorie, or social features unrelated to the gym's verified records.

## Definition of “Member web ready”

The Member web can be considered ready when:

- membership status and remaining time are correct for every lifecycle state;
- Member ownership rules are proven by automated tests;
- requests and notifications are not silently capped;
- all important Member mutations provide visible feedback;
- thermal receipts print correctly;
- timestamps consistently use Manila time;
- critical desktop and mobile journeys pass browser tests;
- no page exposes another Member's information, internal Admin notes, raw NFC credentials, or mutation controls that belong to reception.

## Validation performed during this audit

- Admin Web TypeScript check: **passed**.
- API TypeScript build: **passed**.
- Existing API automated tests: **21/21 passed**.
- Member API integration tests: **not present**.
- Frontend component/browser tests: **not present**.
- Live physical receipt-printer validation: **not performed**.
- Live mobile-device visual QA: **not performed**.

