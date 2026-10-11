# XtrimFitGym 3.0

XtrimFitGym is one connected gym-management system with two deployable services:

- `Admin Web` — the unified Vercel web app for owners, administrators, members, and coaches.
- `Api` — the Express/MongoDB API for accounts, memberships, payments, NFC attendance, coach operations, and audit records.

The web app uses one sign-in page and routes authenticated users by role:

- `/admin/*` — owner and administrator operations.
- `/portal/*` — member and coach self-service.
- `/c/:token` — secure member NFC entry.

## Local setup

```powershell
cd "C:\Users\Asus\Desktop\XtrimFitGym\XtrimFitGym 3.0"
npm.cmd run install:all
Copy-Item "Api\.env.example" "Api\.env.local"
Copy-Item "Admin Web\.env.example" "Admin Web\.env.local"
```

Set the API secrets and MongoDB connection, then run two terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
```

- API: `http://localhost:4000`
- Unified web app: `http://localhost:3100`
- Login: `http://localhost:3100/login`

Before first use, bootstrap the owner and register the reception attendance station. See `Api/README.md`.

## Deployment

1. Deploy `Api` to Render.
2. Deploy `Admin Web` as the single Vercel project.
3. Set `ADMIN_APP_ORIGIN`, `MEMBER_APP_ORIGIN`, and `ALLOWED_ORIGINS` to the same Vercel origin.
4. Point the web app's `/api/*` rewrite to the Render API.
5. Test every role, forced password changes, NFC entry, attendance, enrollment, and account authorization.

Do not commit `.env.local`, secrets, temporary credentials, or NFC portal URLs.
