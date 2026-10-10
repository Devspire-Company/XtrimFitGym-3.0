export type MemberType = 'STUDENT' | 'REGULAR';
export type PlanEligibility = 'ALL' | MemberType;

export function planIsEligible(eligibility: PlanEligibility | undefined, memberType: MemberType) {
  return !eligibility || eligibility === 'ALL' || eligibility === memberType;
}

export function membershipPricing(planPrice: number, firstMembershipFee: number, isFirstMembership: boolean) {
  const planAmount = Math.max(0, planPrice);
  const membershipFee = isFirstMembership ? Math.max(0, firstMembershipFee) : 0;
  return { planAmount, membershipFee, totalDue: planAmount + membershipFee };
}
