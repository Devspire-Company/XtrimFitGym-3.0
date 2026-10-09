import type { ClientSession } from 'mongoose';
import { AuditLog } from './models.js';

export async function audit(actorAccountId: string | null, action: string, targetType: string, targetId: string | null, metadata: Record<string, unknown> = {}, session?: ClientSession): Promise<void> {
  await AuditLog.create([{ actorAccountId, action, targetType, targetId, metadata, occurredAt: new Date() }], session ? { session } : undefined);
}
