# XtrimFitGym 3.0 PWAs

This folder contains the new frontend foundation described in `PWA_NFC_SYSTEM_PROPOSAL.md`:

- `Admin Web` — administrator/owner operations, membership workflow, R80C attendance mode, cards, walk-ins, cash payments and reports.
- `Member Web` — member login, forced first-password change, membership, personal attendance, coaches, gym status and account security.

Neither application uses Clerk. Both assume secure API-managed sessions stored in `HttpOnly`, `Secure`, `SameSite` cookies. Business data is never fabricated in the frontend; when the 3.0 API is unavailable, the UI shows an explicit connection state.

## Local setup

```powershell
cd "XtrimFitGym 3.0"
npm run install:all
Copy-Item "Admin Web\.env.example" "Admin Web\.env.local"
Copy-Item "Member Web\.env.example" "Member Web\.env.local"
npm run dev:admin
```

Run `npm run dev:member` in a second terminal. Admin uses port `3100`; Member uses port `3200`.

### Review the UI before the 3.0 API exists

For local visual review only, set `VITE_DEV_PREVIEW=true` in the relevant `.env.local`. This bypass exists only while Vite is running in development mode, creates no records, and displays no invented business figures. API-backed panels will honestly show that the API is unavailable. Production builds always require real authentication.

## Deployment

Create two separate Vercel projects from the same repository:

| Project | Root directory | Build command | Output |
|---|---|---|---|
| Admin PWA | `XtrimFitGym 3.0/Admin Web` | `npm run build` | `dist` |
| Member PWA | `XtrimFitGym 3.0/Member Web` | `npm run build` | `dist` |

Set `VITE_API_URL` to the future 3.0 API base URL in both projects. The API must allow credentials only from the two exact production origins.

## Required API contract

The current legacy API does not yet provide this contract. These endpoints must be implemented before production use.

### Shared authentication

- `GET /v1/auth/me`
- `POST /v1/auth/login` — `{ username, password, portal, cardToken? }`
- `POST /v1/auth/logout`
- `POST /v1/auth/first-password`

### Admin

- `GET /v1/admin/dashboard`
- `GET /v1/admin/members`
- `POST /v1/admin/members/enroll` — atomic member, cash payment, membership and account creation
- `GET /v1/admin/nfc-cards`
- `POST /v1/admin/nfc-cards/assign`
- `POST /v1/admin/nfc-cards/revoke`
- `GET /v1/admin/attendance`
- `POST /v1/admin/attendance/scan` — registered station and duplicate protection required
- `GET/POST /v1/admin/walk-ins`
- `GET /v1/admin/payments`

### Member

- `GET /v1/member/card/:token` — public-safe recognition only; never return private data
- `GET /v1/member/overview`
- `GET /v1/member/attendance`
- `GET /v1/member/coaches`
- `PUT /v1/member/password`

Every authorization decision, temporary-password restriction, card status check, payment state, duplicate scan rule and role check must be enforced by the API. The PWA is not a security boundary.

## PWA behavior

Both apps include a manifest, installable identity and conservative service worker. The service worker caches only the application shell; it does not cache API responses containing private member or financial information.

The SVG icon is a temporary code-native application mark. Before public launch, export approved square 192×192 and 512×512 brand icons and update each manifest for the best install experience.
