# XtrimFitGym 3.0 Admin Web Audit

**Audit scope:** Admin Web and supporting API only  
**Deferred:** Physical NFC cards and USB NFC reader integration  
**Current functional estimate:** Approximately 60% complete, excluding physical NFC work

## Executive Summary

The Admin system already has a strong authentication, settings, enrollment, walk-in, payment, and dashboard foundation. However, it is not yet launch-complete.

The most important remaining work is completing Member Management and the complete membership lifecycle. These records affect payments, attendance, NFC cards, reports, and the Member PWA.

## Features Already Working

- Secure owner and administrator login
- Forced password change for temporary administrator accounts
- Profile and password settings
- Active session and device management
- Administrator account creation, disabling, and password reset
- Gym status, displayed hours, and walk-in fee settings
- Dashboard connected to real database records
- Membership plan creation and listing
- New member enrollment with membership and cash payment
- New and returning walk-in recording
- Cash payment listing
- Basic attendance history
- PWA installation foundation
- API input validation
- Bcrypt password hashing with a server-side pepper
- HTTP-only session cookies
- Request-origin and mutation verification
- Content Security Policy and security headers
- Owner and administrator role restrictions
- Server-side audit record foundation

## Critical Work Still Missing

### 1. Complete Member Management

The current Members page can search, list, and create members. It still needs:

- Complete member profile view
- Personal-information editing
- Member disabling and reactivation
- Membership history
- Payment history
- Attendance history
- Member password reset
- Walk-in-to-member conversion
- Duplicate-member detection using phone number, email, or other matching information

### 2. Complete the Membership Lifecycle

Administrators can create and list membership plans, but the following operations are missing:

- Edit a membership plan
- Disable or archive a plan
- Renew an existing membership
- Upgrade or change a member's plan
- Pause and resume a membership
- Cancel a membership
- Correct membership dates
- View historical memberships

There is also a status-consistency issue. A membership can remain stored as `ACTIVE` after its expiration date. Some API checks correctly compare the expiration date, but other screens may still display the stored status as active.

### 3. Fix Gym Operating-Hours Logic

The Admin Settings page currently saves operating hours as plain display text. However, the API calculates automatic open or closed status using hardcoded hours of 6:00 AM to 10:00 PM.

Changing the displayed hours therefore does not change the automatic gym-status calculation.

The system needs structured settings for:

- Opening time
- Closing time
- Days of operation
- Special closures or overrides
- Time zone

### 4. Build Coach Management

Coach Management is currently a placeholder. The API can only list existing coach records.

It still needs:

- Create coach
- Edit coach information
- Publish or unpublish coach
- Configure coach availability or schedule
- Disable or archive coach
- Search and filter coaches

### 5. Build Reports and Analytics

Reports and Analytics is currently a placeholder.

Recommended reports include:

- Revenue by date or selected period
- Membership sales
- Walk-in revenue
- Attendance trends
- Active, expired, and expiring memberships
- Member growth
- Popular membership plans
- Cashier or administrator transaction activity
- CSV and PDF exports

## Important Operational Improvements

### Payments

The payment list works, but it still needs:

- Date filters
- Payment-type filters
- Transaction and receipt details
- Amount received and change information
- Printable or downloadable receipt
- Owner-controlled payment correction or voiding
- Required void reason
- Audit records for corrections and voids
- Pagination
- CSV or PDF export

The gym uses over-the-counter payments, so an online payment gateway is not required.

### Walk-ins

Walk-in recording works, but it still needs:

- Searchable returning-guest selection
- Complete visit history per guest
- Walk-in profile editing
- Walk-in-to-member conversion
- Duplicate-profile detection
- Daily totals and reports
- Duplicate-submission protection

### Dashboard

The dashboard is connected to real data. Useful additions include:

- Revenue trends
- Attendance trends
- Expiring-members list
- Pending operational tasks
- More understandable activity descriptions

Recent activity currently shows generic record or account identifiers instead of useful names.

### Owner Audit Trail

The API saves audit events, but there is no owner-facing audit page.

The owner should be able to review:

- Who changed gym settings
- Who created or disabled an administrator
- Who enrolled a member
- Who received a payment
- Who changed a membership
- Who voided or corrected a transaction
- Date and time of each action
- The affected record

### Pagination and Search

Several API endpoints currently use fixed limits such as 100 or 200 records. Proper server-side pagination is needed before the database becomes large.

This should be added to:

- Members
- Payments
- Attendance
- Walk-ins
- Audit logs
- Reports

### Duplicate and Concurrent Request Protection

The system does not yet have generalized idempotency protection for financial and enrollment operations.

A repeated click, slow connection, browser retry, or concurrent request could create duplicate operations in some flows. Protection is especially important for:

- Member enrollment
- Membership activation and renewal
- Walk-in payments
- Payment corrections
- NFC card assignment

## Security Status

### Implemented

- Bcrypt password hashing
- Server-side password pepper
- Password hashes excluded from normal database queries
- HTTP-only authentication cookies
- Secure cookies in production
- Session expiration
- Login rate limiting
- Request-origin verification
- Custom mutation-request header verification
- Role-based access restrictions
- Content Security Policy
- Security headers through Helmet
- Server-side validation with Zod
- Audit records for important actions

### Still Recommended

- Endpoint integration tests for authorization rules
- Owner-versus-administrator permission tests
- Account lockout or escalating delays after repeated failed logins
- Audit-log viewer
- Backup and recovery procedure
- Production secret-rotation procedure
- Production database-access review
- Monitoring and error alerts

## PWA and Connectivity Notes

- The Admin Web has a valid PWA foundation and service worker.
- The application shell can be cached, but operational actions still require an internet connection and the live API.
- Payments and attendance should not be silently queued offline because duplicate or conflicting records could be created.
- Clear offline and reconnecting messages should be added to important forms.
- Production updates should be tested to ensure old cached assets are replaced correctly.

## Testing Still Required

The current security utility tests pass, but broader coverage is still needed:

- API endpoint integration tests
- Database transaction rollback tests
- OWNER versus ADMIN permission tests
- Duplicate and concurrent request tests
- Browser end-to-end tests
- Responsive layout testing
- Slow-network testing
- Offline and reconnection testing
- Invalid-input testing
- Production smoke testing
- Multi-user testing

## Recommended Implementation Order

1. Complete Member Management.
2. Complete membership renewal, expiration, pause, cancellation, and history.
3. Fix structured gym hours and automatic open/closed calculation.
4. Improve walk-in search, history, duplicate detection, and conversion.
5. Complete payment receipts, filtering, voiding, and exports.
6. Build Coach Management.
7. Build Reports and Analytics.
8. Add an owner-facing audit log.
9. Add pagination and duplicate-request protection.
10. Add API integration and browser end-to-end testing.
11. Finish NFC card and physical reader integration after the hardware arrives.

## Recommended Next Focus

The next implementation phase should be **Member Management and the complete membership lifecycle**.

These are the core operational records used by:

- Payments
- Attendance
- NFC cards
- Reports
- Dashboard statistics
- Member accounts
- Member PWA

Completing this area first will prevent repeated revisions in the other modules.

