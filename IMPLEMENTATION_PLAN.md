## Stage 1: Regression coverage
**Goal**: Reproduce import completion, attachment references, filename and setup readiness failures.
**Success Criteria**: Focused tests fail on existing behavior.
**Tests**: Collector retries, scoped reference media, upload namespace, pairing readiness.
**Status**: Complete

## Stage 2: Narrow backend and Nox fixes
**Goal**: Recover completed imports, preserve visual references, accept valid filenames, gate connection during setup.
**Success Criteria**: No changes to collection lifecycle or account authorization.
**Tests**: Focused regressions and full test suite.
**Status**: Complete

## Stage 3: Onboarding polish
**Goal**: Clear, minimal setup progression with a visible primary action and accurate readiness.
**Success Criteria**: First-time setup remains clear after closing/reopening the dialog; connect is not offered prematurely.
**Tests**: Typecheck, lint, hosted UI review.
**Status**: In Progress

## Stage 4: Release verification
**Goal**: Ship verified fixes and check hosted flows with isolated fixtures.
**Success Criteria**: Build passes, production deployment verified, current account and Nox installation untouched.
**Tests**: Hosted isolated integration checks and browser screenshots.
**Status**: Not Started
