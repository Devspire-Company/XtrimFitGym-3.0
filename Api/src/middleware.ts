import type { NextFunction, Request, Response } from 'express';
import { Account, AuthSession, type AccountRole } from './models.js';
import { config } from './config.js';
import { HttpError } from './http.js';
import { tokenHash } from './security.js';

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[config().SESSION_COOKIE_NAME] as string | undefined;
    if (!token) return next();
    const session = await AuthSession.findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } }).lean<any>();
    if (!session) return next();
    const account = await Account.findOne({ _id: session.accountId, isActive: true }).lean<any>();
    if (!account) return next();
    req.auth = {
      sessionId: String(session._id), accountId: String(account._id), role: account.role,
      memberId: account.memberId ? String(account.memberId) : null,
      mustChangePassword: Boolean(account.mustChangePassword), firstName: account.firstName, lastName: account.lastName,
    };
    void AuthSession.updateOne({ _id: session._id }, { $set: { lastSeenAt: new Date() } }).catch(() => undefined);
    next();
  } catch (error) { next(error); }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new HttpError(401, 'Please sign in to continue.'));
  next();
}

export function requireReadyAccount(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(new HttpError(401, 'Please sign in to continue.'));
  if (req.auth.mustChangePassword) return next(new HttpError(403, 'Change your temporary password before continuing.', 'PASSWORD_CHANGE_REQUIRED'));
  next();
}

export const requireRoles = (...roles: AccountRole[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.auth) return next(new HttpError(401, 'Please sign in to continue.'));
  if (!roles.includes(req.auth.role)) return next(new HttpError(403, 'You do not have permission to perform this action.'));
  next();
};

export function verifyMutationOrigin(req: Request, _res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin || !config().allowedOrigins.includes(origin)) return next(new HttpError(403, 'Request origin is not allowed.'));
  next();
}

