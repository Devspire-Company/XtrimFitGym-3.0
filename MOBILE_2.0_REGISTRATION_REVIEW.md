# X-TRIM FIT GYM 2.0 Mobile Registration Review

## Purpose

This document records what the old 2.0 mobile application actually did during member registration. It is intended to guide the final enrollment flow for the 3.0 Admin and Member PWAs.

> This is a technical product review, not legal advice. The final wording and requirements for waivers, minors, privacy consent, and signatures should be approved by the gym owner and, when necessary, a qualified legal professional.

## Short conclusion

The 2.0 app had a four-step onboarding flow, membership-plan requests, and a Terms and Conditions screen. However, the legal-document process was incomplete:

- the member only checked one general **Terms and Conditions** checkbox;
- there was no digital signature screen;
- there was no guardian consent form or guardian signature screen;
- no guardian ID was uploaded during mobile registration;
- privacy-policy and liability-waiver fields existed in the API/database but were not submitted by the onboarding screen; and
- the Terms text said minors needed written guardian consent, but the app did not enforce that requirement.

Therefore, 3.0 should not copy the old registration flow exactly. It should retain the useful profile and plan-selection steps, then add an explicit and auditable consent process before activating a membership or issuing an NFC card.

## Actual 2.0 registration flow

### 1. Account creation

The member created an account using either:

- email verification through Clerk; or
- Google sign-in through Clerk.

The signup form collected first name, optional middle name, last name, and email. After Clerk authentication, the app also created a corresponding MongoDB member record through the API.

Google users whose Clerk account existed but whose MongoDB record was missing were sent to a separate **Complete Registration** screen to provide their name.

### 2. Personal information

Onboarding Step 1 collected:

- phone number;
- date of birth; and
- gender.

The phone number was required to contain exactly 11 digits.

The age validation only rejected an approximate age below 10. This conflicted with the Terms text, which stated that members should be 18 or older unless they had written parental or guardian consent. The birthday calculation was also based only on the year difference, not the full birth date.

### 3. Fitness preferences

Onboarding Step 2 collected:

- one or more fitness goals;
- body type: ectomorph, mesomorph, endomorph, or not sure; and
- preferred workout time.

Workout time could use a preset period or a custom period between 10:00 AM and 10:00 PM in 15-minute intervals.

These fields were profile preferences. They did not activate a membership.

### 4. Membership decision

Onboarding Step 3 allowed the member to:

- view active membership plans and send a subscription request; or
- continue without a membership.

When a plan was requested:

1. the app created a **pending subscription request**;
2. the member was reminded to pay at the front desk;
3. an administrator had to approve the request; and
4. approval created the membership transaction.

There was no online payment in this flow. Payment was intended to happen over the counter.

If the member skipped the plan, the account could continue in a limited state and request a membership later.

### 5. Terms completion

Onboarding Step 4 displayed ten sections:

1. membership eligibility;
2. health and safety;
3. member conduct;
4. equipment use;
5. personal belongings;
6. cleanliness and hygiene;
7. payments and refunds;
8. class and facility rules;
9. liability waiver; and
10. changes to the terms.

The member had only one checkbox: **I agree to the Terms and Conditions**.

After completion, the app saved the profile information, fitness preferences, general Terms agreement, and an onboarding-complete flag.

## Signature, waiver, and guardian findings

The 2.0 API and MongoDB model contained fields for:

- general Terms agreement;
- privacy-policy agreement;
- liability-waiver agreement;
- guardian ID verification photo URL;
- minor liability-waiver printed name; and
- minor liability-waiver signature URL.

Those fields show that a more complete process was anticipated. They do **not** prove that the process was finished.

The reviewed mobile onboarding only submitted the general Terms agreement. It did not collect or submit the other consent, guardian, or signature fields.

The Terms stated that a person below 18 must present written parental or guardian consent, but the registration flow did not:

- reliably determine whether the member was a minor;
- block a minor from continuing;
- collect a guardian name or relationship;
- collect a guardian contact number;
- upload a guardian ID;
- display a dedicated minor waiver;
- collect a guardian signature; or
- record the signed document version, date, and administrator witness.

There was a separate minor-waiver concept for **walk-ins** in other parts of 2.0. That is not the same as a completed member-registration waiver.

## Problems that should not be copied into 3.0

1. **Conflicting age rules** — the form allowed users around age 10 and above, while the Terms described an 18+ rule with guardian consent for minors.
2. **One checkbox represented several different agreements** — Terms, privacy, and liability should be clearly distinguished and versioned.
3. **Backend fields without a completed user flow** — signature and guardian fields existed, but registration did not populate them.
4. **No proof of consent** — there was no stored document version, signing timestamp, signer identity, or administrator witness in the onboarding UI.
5. **No enforced counter-payment completion** — the mobile app created a request, but payment and activation depended on a later administrator action.
6. **Temporary onboarding state** — onboarding values were held in app memory until completion, so interruption could lose progress.
7. **Incomplete completion behavior** — the reviewed final step saved a local welcome state but did not clearly perform a final route transition in its success callback.

## Recommended 3.0 counter enrollment flow

Because X-TRIM FIT GYM registers and accepts payment over the counter, the Admin PWA should control the authoritative enrollment.

### Adult member

1. Admin opens **New Membership**.
2. Admin enters the member's identity and contact information.
3. Admin selects the membership plan.
4. The member reviews the current Terms, Privacy Notice, and Liability Waiver.
5. The system records each required consent and the document version.
6. The member signs on the counter device or completes a secure signing step on their phone.
7. Admin records the cash received and confirms the amount.
8. The API creates the member, payment, and active membership as one controlled operation.
9. The system generates the member username and temporary password.
10. Admin assigns and tests the NFC card.
11. The member receives the card and account credentials and must change the temporary password on first login.

### Minor member

Steps 1–3 remain the same, followed by:

1. The date of birth automatically marks the application as a minor case.
2. A parent or legal guardian provides their name, relationship, contact details, and required identification.
3. The guardian reviews and signs the dedicated minor consent and liability waiver.
4. The system stores the agreement version, timestamp, guardian identity details, signature reference, and the administrator who verified it.
5. Membership activation, payment completion, and NFC-card issuance remain blocked until all required guardian items are complete.

### Existing walk-in converting to membership

The current 3.0 **New Membership** modal no longer exposes a confusing “Create a new member” dropdown. A member enrollment always includes a plan.

If a returning walk-in later becomes a member, the recommended implementation is to start the action from that walk-in's profile using a clear **Convert to member** button. This preserves their visit history without putting an optional conversion selector in the normal new-membership form.

## Data that 3.0 should retain for auditability

- member identity and date of birth;
- membership plan and price at purchase;
- cash amount received, receipt/reference, cashier, and timestamp;
- separate required consent states;
- exact Terms, Privacy Notice, and Waiver version accepted;
- signature reference and signing timestamp;
- guardian information and verification evidence when applicable;
- administrator who reviewed and activated the membership;
- NFC card assignment and issuance timestamp; and
- all later corrections, pauses, renewals, cancellations, and manual attendance actions.

## Decisions still needed before implementation

1. What is the minimum membership age?
2. Are minors allowed, and which ages require a guardian?
3. Will signatures be captured on the admin device, on the member's phone, or on paper with a scanned copy?
4. Which guardian ID details or photo are legally necessary and safe to retain?
5. What are the final approved Terms, Privacy Notice, adult waiver, and minor waiver texts?
6. Should an existing walk-in retain the same profile when converted to a member? The recommended answer is yes.
7. What receipt/reference format should be used for over-the-counter cash payments?

## Recommended next action

Review and approve the decisions above before expanding the 3.0 New Membership form. Once the legal and business rules are confirmed, the form can be implemented as a short step-by-step enrollment wizard instead of one oversized modal.
