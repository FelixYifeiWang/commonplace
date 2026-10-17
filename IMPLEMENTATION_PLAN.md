## Stage 1: Foundation and connection protocol
**Goal**: Establish the app, durable data model, scoped agent onboarding, and provenance rules.
**Success Criteria**: Connection keys are hashed, revocable, and bound to their owner and device; repeated imports deduplicate.
**Tests**: Invalid input, unsafe URLs, credential scope, duplicate identity, and transcript parsing.
**Status**: Complete

## Stage 2: Workspace experience
**Goal**: Build sign-in, empty onboarding, collections, session controls, object details, and the buddy.
**Success Criteria**: Every visible control works; sample content is clearly separated from personal data; loading and errors are explicit.
**Tests**: Browser walkthrough of sample space, empty space, connection, collection switching, block details, collection creation, and pause/resume.
**Status**: Complete

## Stage 3: Session bridge and desktop companion
**Goal**: Deliver agent-readable setup, an incremental transcript bridge, and a real Electron floating buddy.
**Success Criteria**: A selected transcript can send new references; stopping a subscription blocks writes; buddy reflects actual state.
**Tests**: End-to-end ingestion, replay, update, pause, invalid credentials, and desktop launch.
**Status**: Complete

## Stage 4: Verify and publish
**Goal**: Validate behavior, inspect the UI, and publish the private first version.
**Success Criteria**: Type checks, lint, protocol tests, browser checks, and production build pass; limitations are documented.
**Tests**: Production build, service authorization, narrow viewport, keyboard navigation, and deployed status.
**Status**: In Progress

Draft scope: hosted AI extraction, automatic agent connector setup, signed installers, arbitrary cross-app targeting, and mind maps remain future work.
