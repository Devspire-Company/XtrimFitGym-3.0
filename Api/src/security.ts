import bcrypt from 'bcryptjs';
import { createHmac, randomBytes } from 'node:crypto';
import { config } from './config.js';

export const normalizeUsername = (value: string) => value.trim().toLowerCase();
export const normalizeCardUid = (value: string) => value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const tokenHash = (token: string) => createHmac('sha256', config().SESSION_SECRET).update(token).digest('hex');
export const portalTokenHash = (token: string) => createHmac('sha256', config().SESSION_SECRET).update(`card:${token}`).digest('hex');

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(`${password}${config().PASSWORD_PEPPER}`, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(`${password}${config().PASSWORD_PEPPER}`, hash);
}

export function temporaryPassword(): string {
  return `Xtf-${randomBytes(6).toString('base64url')}!9`;
}

export function reference(prefix: string): string {
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(2, 14);
  return `${prefix}-${stamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function memberNumber(): string {
  return reference('XTF');
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

