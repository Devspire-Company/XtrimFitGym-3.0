# XtrimFitGym 3.0 API

REST API for the Admin and Member PWAs. It uses MongoDB Atlas, cash-only payment records, opaque server-side sessions, custom username/password accounts, and NFC attendance. It does not use Clerk, MySQL, Railway, or the old biometric integration.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Put the new MongoDB Atlas connection string in `MONGODB_URI`. Use a separate database such as `XtrimFitGym3`.
3. Generate two different random secrets of at least 32 characters for `SESSION_SECRET` and `PASSWORD_PEPPER`.
4. Run `npm install`, then `npm run build`.
5. Create the first owner once:

   `npm run bootstrap:owner -- owner StrongPassword9 Owner Name`

6. Register the reception laptop once with a secret station identifier:

   `npm run bootstrap:station -- reception-laptop-01 "Reception laptop"`

7. Put that same station identifier in `Admin Web/.env.local` as `VITE_ATTENDANCE_STATION_ID`, then run `npm run dev`.

Never commit `.env.local`, secrets, temporary passwords, or the card portal URL/token.

## Important operational rules

- There is no public sign-up. The owner is bootstrapped; member accounts are created by the atomic enrollment endpoint.
- A member receives a temporary password and must replace it before other member endpoints work.
- Membership activation creates the member, account, membership, and cash-payment record in one MongoDB transaction.
- Only one active membership and one active card are allowed per member.
- NFC attendance requires an authenticated admin and a registered station ID. Duplicate scans inside the configured window are rejected.
- The card URL token is returned only when a card is assigned. Store/encode it then; only its hash is kept in MongoDB.
- Deploy on a persistent Node host such as Render. MongoDB Atlas must allow that host's network access.
