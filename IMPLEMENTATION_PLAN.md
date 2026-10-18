## Stage 1: Collections and views

**Goal**: Restore Gallery beside Map and Story, distinguish All collections, and allow overview deletion with Undo.
**Success Criteria**: Three explicit views; newest collections first; consistent Collection language; no nested buttons.
**Tests**: Hosted browser checks for views, picker, delete/Undo and mobile layout.
**Status**: Complete

## Stage 2: Real accounts

**Goal**: Integrate direct Google OAuth authentication with isolated owner spaces and a safe claim for the existing prototype space.
**Success Criteria**: Auth provider controls sessions; new users cannot see existing data; old device and file ownership remain valid; unconfigured providers are never advertised as working.
**Tests**: Owner mapping/claim isolation tests; hosted authentication checks; provider configuration review.
**Status**: In Progress

## Stage 3: Hosted release

**Goal**: Run checks in Vercel, deploy, and leave the hosted app ready for testing.
**Success Criteria**: Remote build checks pass; hosted UI/API checks pass; credentials excluded from Git; any provider activation requirement is explicit.
**Tests**: Vercel unit/lint/build gate, hosted disposable fixtures and browser QA. No localhost testing.
**Status**: Not Started

## Hosted verification

- Vercel deployment `dpl_AhEthqYsJrPqpbqEHjGg9LNJLsLr`: 212 tests, ESLint, TypeScript and production build passed.
- Hosted demo: Gallery/Map/Story, picker hierarchy, overview delete/Undo, mobile Gallery and Story checked. No horizontal overflow at 390px.
- Applied additive Turso migrations 0008 and 0009. Saved BETTER_AUTH_SECRET and BETTER_AUTH_URL in Vercel production.
- Google project `commonplace-512015` branding created. OAuth web-client form is ready with the production origin and `/api/auth/callback/google`. Awaiting explicit browser confirmation before creating credentials and saving them to Vercel.
- Remaining: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, Google audience configuration, redeploy, `tests/hosted-account.integration.mjs`, actual Google sign-in and existing-space claim. Google remains disabled until credentials are configured; legacy access code still works.
