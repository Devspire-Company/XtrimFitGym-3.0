# XtrimFitGym 3.0

XtrimFitGym 3.0 replaces the biometric/Clerk prototype with one connected system:

- `Admin Web` — installable Admin PWA for membership enrollment, cash payments, NFC cards, attendance, walk-ins, plans, and gym settings.
- `Member Web` — installable Member PWA for membership status, personal attendance, coaches, gym status, and password management.
- `Api` — Node/Express REST API with MongoDB Atlas, custom accounts, secure server-side sessions, authorization, transactions, and audit records.

No Clerk, MySQL, Railway, mobile APK, or biometric device is required by 3.0.

## Local setup

```powershell
cd "C:\Users\Asus\Desktop\XtrimFitGym\XtrimFitGym 3.0"
npm.cmd run install:all
Copy-Item "Api\.env.example" "Api\.env.local"
Copy-Item "Admin Web\.env.example" "Admin Web\.env.local"
Copy-Item "Member Web\.env.example" "Member Web\.env.local"
```

Complete `Api/.env.local` with the new MongoDB Atlas connection and random secrets. Then open three PowerShell terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:admin
npm.cmd run dev:member
```

- API: `http://localhost:4000`
- Admin PWA: `http://localhost:3100`
- Member PWA: `http://localhost:3200`

Before the first sign-in, create the owner and reception station exactly once. See `Api/README.md`.

## Verified commands

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

## Deployment order

1. Create/configure the new MongoDB Atlas database.
2. Create a **new** Render Web Service with root directory `Api`.
3. Bootstrap the first owner and reception station against the production database.
4. Create separate Vercel projects with root directories `Admin Web` and `Member Web`.
5. Configure exact production origins in Render and the new API URL in both Vercel projects.
6. Test login, forced password change, plan creation, enrollment/payment, card assignment, attendance, duplicate scan rejection, walk-in payment, and member history before real use.

Do not connect 3.0 to the old 2.0 database or old Render API. Do not commit `.env.local`, session secrets, database credentials, temporary passwords, or NFC portal URLs.
