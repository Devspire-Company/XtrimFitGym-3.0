import type { ClientSession } from 'mongoose';
import { Account, Member, Membership, NfcCard, Notification } from './models.js';
import { addDays } from './security.js';

type NotificationInput = {
  type: 'MEMBERSHIP_EXPIRING' | 'CARD_REQUIRED' | 'PAYMENT_VOIDED' | 'SECURITY';
  tone: 'INFO' | 'ACTION' | 'WARNING';
  title: string;
  message: string;
  actionUrl?: string;
  sourceId?: string;
  dedupeKey: string;
};

export async function createNotification(recipientAccountId: string, input: NotificationInput, session?: ClientSession) {
  await Notification.updateOne(
    { recipientAccountId, dedupeKey: input.dedupeKey },
    { $setOnInsert: { recipientAccountId, ...input } },
    { upsert: true, session },
  );
}

export async function notifyOwners(input: NotificationInput, excludeAccountId?: string, session?: ClientSession) {
  const filter: Record<string, unknown> = { role: 'OWNER', isActive: true };
  if (excludeAccountId) filter._id = { $ne: excludeAccountId };
  const ownerIds = await Account.find(filter).session(session ?? null).distinct('_id');
  if (!ownerIds.length) return;
  await Notification.bulkWrite(ownerIds.map((recipientAccountId) => ({
    updateOne: {
      filter: { recipientAccountId, dedupeKey: input.dedupeKey },
      update: { $setOnInsert: { recipientAccountId, ...input } },
      upsert: true,
    },
  })), { session });
}

export async function syncOperationalNotifications(recipientAccountId: string) {
  const now = new Date();
  const expiring = await Membership.find({ status: 'ACTIVE', expiresAt: { $gt: now, $lte: addDays(now, 7) } })
    .populate('memberId', 'firstName lastName memberNumber status').lean<any[]>();
  const activeMemberships = await Membership.find({ status: 'ACTIVE', startsAt: { $lte: now }, expiresAt: { $gt: now } }).select('memberId').lean<any[]>();
  const activeMemberIds = activeMemberships.map((row) => row.memberId);
  const cardMemberIds = new Set((await NfcCard.find({ memberId: { $in: activeMemberIds }, status: 'ACTIVE' }).distinct('memberId')).map(String));
  const cardlessMembers = await Member.find({ _id: { $in: activeMemberIds.filter((memberId) => !cardMemberIds.has(String(memberId))) }, status: 'ACTIVE' })
    .select('firstName lastName memberNumber').lean<any[]>();

  const expiryKeys = expiring.map((row) => `membership-expiring:${row._id}:${new Date(row.expiresAt).toISOString()}`);
  const cardKeys = cardlessMembers.map((row) => `card-required:${row._id}`);
  await Promise.all([
    ...expiring.filter((row) => row.memberId?.status === 'ACTIVE').map((row) => createNotification(recipientAccountId, {
      type: 'MEMBERSHIP_EXPIRING', tone: 'ACTION', dedupeKey: `membership-expiring:${row._id}:${new Date(row.expiresAt).toISOString()}`,
      sourceId: String(row.memberId._id), title: `${row.memberId.firstName} ${row.memberId.lastName}'s membership expires soon`,
      message: `${row.planName} ends ${new Date(row.expiresAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })}. Review renewal before access ends.`,
      actionUrl: `/admin/members/${row.memberId._id}`,
    })),
    ...cardlessMembers.map((row) => createNotification(recipientAccountId, {
      type: 'CARD_REQUIRED', tone: 'ACTION', dedupeKey: `card-required:${row._id}`, sourceId: String(row._id),
      title: `${row.firstName} ${row.lastName} needs an NFC card`, message: `${row.memberNumber} has an active membership but no active attendance card.`, actionUrl: '/admin/nfc-cards',
    })),
  ]);

  await Promise.all([
    Notification.updateMany({ recipientAccountId, type: 'MEMBERSHIP_EXPIRING', resolvedAt: null, ...(expiryKeys.length ? { dedupeKey: { $nin: expiryKeys } } : {}) }, { $set: { resolvedAt: now } }),
    Notification.updateMany({ recipientAccountId, type: 'CARD_REQUIRED', resolvedAt: null, ...(cardKeys.length ? { dedupeKey: { $nin: cardKeys } } : {}) }, { $set: { resolvedAt: now } }),
    expiryKeys.length ? Notification.updateMany({ recipientAccountId, dedupeKey: { $in: expiryKeys }, deletedAt: null }, { $set: { resolvedAt: null } }) : Promise.resolve(),
    cardKeys.length ? Notification.updateMany({ recipientAccountId, dedupeKey: { $in: cardKeys }, deletedAt: null }, { $set: { resolvedAt: null } }) : Promise.resolve(),
  ]);
}
