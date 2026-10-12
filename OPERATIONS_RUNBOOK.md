# X-TRIM FIT GYM 3.0 Operations Runbook

This runbook covers the API service and MongoDB data used by the unified Admin, Member, and Coach web application.

## Deployment gate

1. Set all variables from `Api/.env.example` in the hosting environment. Never commit their real values.
2. Use Node 22 and run `npm ci`, `npm run typecheck`, `npm test`, and `npm run build` inside `Api`.
3. Run `npm run migrate:production` after building and before starting the new API build (`npm run migrate` is the `.env.local` development equivalent). Migrations are recorded in MongoDB's `_migrations` collection and are safe to rerun.
4. Start with `npm start`. Render can use the repository `render.yaml`; `/ready` is its readiness check.
5. Build `Admin Web`, deploy it, and smoke-test login, enrollment, payment, attendance, receipt printing, cash closing, and a report export.

Do not deploy a build if migration, readiness, tests, or the smoke test fails.

## Health, logs, and monitoring

- `GET /health` confirms the process is responding.
- `GET /ready` returns HTTP 200 only while MongoDB is connected. Point the hosting uptime check here and alert after two consecutive failures.
- `GET /metrics` returns Prometheus text only when `X-Monitoring-Token` matches `MONITORING_TOKEN`. Monitor `xtrim_database_ready`, HTTP 5xx counts, request volume, and average request duration (duration total divided by observed requests).
- API logs are one JSON object per line. Every request has an `X-Request-Id`; use it to join the request and error entries. Passwords, secrets, tokens, cookies, and authorization fields are redacted.
- Configure a MongoDB Atlas alert for unavailable nodes, connections above 80%, storage above 80%, and replication lag. Configure the API host to alert on readiness failures, restarts, and elevated 5xx responses.

Suggested paging: readiness down for 2 minutes, any repeated startup failure, or 5xx responses above 5% for 5 minutes. Warnings that do not affect availability can go to email rather than paging.

## Backup and restore drill

MongoDB Database Tools (`mongodump` and `mongorestore`) must be installed on the runner.

1. Set `BACKUP_DIRECTORY` to encrypted durable storage and run `npm run backup`. The command creates a compressed archive and a JSON manifest containing its SHA-256 checksum.
2. Copy both files off the API host. Retain daily backups for 30 days and monthly backups for 12 months. Enable Atlas managed backups as the primary automated backup layer; the script is the independently verifiable export.
3. At least monthly, set a dedicated database such as `XtrimFitGym3_restore_check` in `RESTORE_DATABASE`, then run `npm run backup:verify -- <archive-path>`.
4. The verification command refuses to target the live database, restores with `--drop` only into the `_restore_check` database, and verifies the core collections. Record the date, archive checksum, counts, operator, duration, and result.
5. After review, delete only the dedicated restore-check database through MongoDB Atlas. Never point `RESTORE_DATABASE` at production.

## Daily cash closing

Only an owner can close cash. The API calculates collected cash from completed payments and stores opening cash, expected cash, counted cash, variance, closer, timestamp, and notes. Once closed, the server blocks new payments and payment voids for that Manila business date. An owner may void the closing with a reason to reopen corrections; both records remain in the audit log. Investigate and explain every non-zero variance before closing.

## Incident response

1. Confirm impact using `/ready`, `/metrics`, host events, Atlas status, and request IDs from structured logs.
2. Stop unsafe writes if financial or membership integrity is uncertain. Do not delete or hand-edit payment, audit, attendance, or cash-closing records.
3. Preserve relevant request IDs, timestamps, actor IDs, deploy version, and audit entries. Do not paste credentials or member personal data into public tickets.
4. Roll back the application only if the previous build is compatible with already-applied migrations. Migrations in this project are forward-only; create a corrective migration for data or index changes.
5. For data loss, restore the newest verified backup into a separate database first, validate counts and recent records, then plan the production cutover. Never restore over production during diagnosis.
6. After recovery, document the timeline, cause, affected records, remediation, and prevention work.

## Owner recovery and secret rotation

- Use `npm run reset:owner-password -- <username>` from a trusted environment with production variables; deliver the temporary password privately and require first-login replacement.
- Rotate `SESSION_SECRET` to invalidate all sessions. Rotate `PASSWORD_PEPPER` only with a planned password reset for every account because existing password hashes depend on it.
- Rotate database credentials in Atlas, update the host secret, redeploy, verify `/ready`, then revoke the old credential.
- Rotate `MONITORING_TOKEN` in the API and monitoring system together.
- Record recovery and rotations in the private incident record without including secret values.
