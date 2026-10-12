import type { ClientSession } from 'mongoose';
import { CashClosing, CashDayLock, Payment } from './models.js';
import { HttpError } from './http.js';
import { manilaDateKey, manilaDayBounds } from './manila-time.js';

export async function lockCashDay(session: ClientSession, businessDate = manilaDateKey()) {
  await CashDayLock.findOneAndUpdate(
    { _id: businessDate },
    { $set: { touchedAt: new Date() } },
    { upsert: true, new: true, session },
  );
}

export async function lockOpenCashDay(session: ClientSession, businessDate = manilaDateKey()) {
  await lockCashDay(session, businessDate);
  if (await CashClosing.exists({ businessDate, status: 'CLOSED' }).session(session)) {
    throw new HttpError(409, `Cash for ${businessDate} is already closed. Void the closing before recording or changing payments.`, 'CASH_DAY_CLOSED');
  }
}

export async function cashCollectionSummary(businessDate: string, session?: ClientSession) {
  const bounds = manilaDayBounds(businessDate);
  const aggregate = Payment.aggregate<{ cashCollected: number; paymentCount: number }>([
    { $match: { status: 'COMPLETED', receivedAt: { $gte: bounds.start, $lt: bounds.end } } },
    { $group: { _id: null, cashCollected: { $sum: '$amountDue' }, paymentCount: { $sum: 1 } } },
    { $project: { _id: 0, cashCollected: 1, paymentCount: 1 } },
  ]);
  if (session) aggregate.session(session);
  const [summary] = await aggregate;
  return summary ?? { cashCollected: 0, paymentCount: 0 };
}

export function calculateCashClosing(openingCash: number, cashCollected: number, countedCash: number) {
  const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const expectedCash = money(openingCash + cashCollected);
  return { expectedCash, variance: money(countedCash - expectedCash) };
}
