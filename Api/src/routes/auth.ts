import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Account, AuthSession, NfcCard } from '../models.js';
import { config } from '../config.js';
import { asyncRoute, HttpError } from '../http.js';
import { hashPassword, normalizeUsername, portalTokenHash, randomToken, tokenHash, verifyPassword } from '../security.js';
import { requireAuth } from '../middleware.js';
import { audit } from '../audit.js';

export const authRouter = Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Too many sign-in attempts. Please wait and try again.' } });
const credentialsSchema = z.object({ username: z.string().min(3).max(100), password: z.string().min(8).max(200), portal: z.enum(['admin', 'member']), cardToken: z.string().min(20).max(200).optional() });
const passwordSchema = z.object({ currentPassword: z.string().min(8).max(200), newPassword: z.string().min(10).max(200).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/) });

function accountResponse(account: any) {
  return {
    id: String(account._id), firstName: account.firstName, lastName: account.lastName, role: account.role,
    memberNumber: account.memberId?.memberNumber ?? undefined, mustChangePassword: Boolean(account.mustChangePassword),
  };
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: config().NODE_ENV === 'production',
    sameSite: config().NODE_ENV === 'production' ? 'none' as const : 'lax' as const,
    path: '/',
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

authRouter.post('/login', loginLimiter, asyncRoute(async (req, res) => {
  const input = credentialsSchema.parse(req.body);
  const account = await Account.findOne({ username: normalizeUsername(input.username), isActive: true }).select('+passwordHash').populate('memberId', 'memberNumber').exec() as any;
  const valid = account && await verifyPassword(input.password, account.passwordHash);
  if (!valid) throw new HttpError(401, 'Invalid username or password.');
  const isAdmin = account.role === 'OWNER' || account.role === 'ADMIN';
  if ((input.portal === 'admin' && !isAdmin) || (input.portal === 'member' && account.role !== 'MEMBER')) throw new HttpError(403, 'This account cannot access this portal.');

  if (input.cardToken) {
    const card = await NfcCard.findOne({ portalTokenHash: portalTokenHash(input.cardToken), status: 'ACTIVE' }).select('+portalTokenHash').lean<any>();
    if (!card || String(card.memberId) !== String(account.memberId?._id ?? account.memberId)) throw new HttpError(403, 'This card is not linked to that account.');
  }

  const token = randomToken();
  const hours = isAdmin ? config().SESSION_HOURS_ADMIN : config().SESSION_HOURS_MEMBER;
  const expiresAt = new Date(Date.now() + hours * 3_600_000);
  await AuthSession.create({ tokenHash: tokenHash(token), accountId: account._id, role: account.role, expiresAt, userAgent: req.get('user-agent')?.slice(0, 300) ?? '', ipAddress: req.ip });
  account.lastLoginAt = new Date();
  await account.save();
  res.cookie(config().SESSION_COOKIE_NAME, token, cookieOptions(hours * 3_600_000));
  await audit(String(account._id), 'AUTH_LOGIN', 'Account', String(account._id), { portal: input.portal });
  res.json(accountResponse(account));
}));

authRouter.get('/me', requireAuth, asyncRoute(async (req, res) => {
  const account = await Account.findById(req.auth!.accountId).populate('memberId', 'memberNumber').lean<any>();
  if (!account) throw new HttpError(401, 'Your account is no longer available.');
  res.json(accountResponse(account));
}));

authRouter.post('/logout', asyncRoute(async (req, res) => {
  const token = req.cookies?.[config().SESSION_COOKIE_NAME] as string | undefined;
  if (token) await AuthSession.deleteOne({ tokenHash: tokenHash(token) });
  res.clearCookie(config().SESSION_COOKIE_NAME, cookieOptions());
  res.status(204).end();
}));

authRouter.post('/first-password', requireAuth, asyncRoute(async (req, res) => {
  if (!req.auth!.mustChangePassword) throw new HttpError(409, 'The temporary password has already been changed.');
  const input = passwordSchema.parse(req.body);
  const account = await Account.findById(req.auth!.accountId).select('+passwordHash').exec() as any;
  if (!account || !await verifyPassword(input.currentPassword, account.passwordHash)) throw new HttpError(401, 'The current password is incorrect.');
  account.passwordHash = await hashPassword(input.newPassword);
  account.mustChangePassword = false;
  await account.save();
  await AuthSession.deleteMany({ accountId: account._id, _id: { $ne: req.auth!.sessionId } });
  await audit(req.auth!.accountId, 'PASSWORD_INITIALIZED', 'Account', req.auth!.accountId);
  res.status(204).end();
}));
