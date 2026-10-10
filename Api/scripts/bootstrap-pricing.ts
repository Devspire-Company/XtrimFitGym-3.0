import { connectDatabase, disconnectDatabase } from '../src/db.js';
import { GymSettings, MembershipPlan } from '../src/models.js';

const plans = [
  { name: '15-Day Membership', price: 350, durationDays: 15, eligibility: 'ALL', isPromo: false },
  { name: 'Monthly Student', price: 500, durationDays: 30, eligibility: 'STUDENT', isPromo: false },
  { name: 'Monthly Regular', price: 600, durationDays: 30, eligibility: 'REGULAR', isPromo: false },
  { name: '3-Month Student Promo', price: 1200, durationDays: 90, eligibility: 'STUDENT', isPromo: true },
  { name: '3-Month Regular Promo', price: 1500, durationDays: 90, eligibility: 'REGULAR', isPromo: true },
] as const;

async function main() {
  await connectDatabase();
  await Promise.all(plans.map((plan) => MembershipPlan.findOneAndUpdate(
    { name: plan.name },
    { $set: { ...plan, isActive: true } },
    { upsert: true, new: true },
  )));
  await GymSettings.findOneAndUpdate(
    { key: 'primary' },
    { $set: { defaultWalkInFee: 70, firstMembershipFee: 100 }, $setOnInsert: { gymStatusOverride: 'AUTO', hoursToday: 'Contact the gym for today\'s hours.' } },
    { upsert: true, new: true },
  );
  console.log('X-TRIM pricing configured: 5 membership plans, ₱100 first-membership fee, and ₱70 walk-in fee.');
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(disconnectDatabase);
