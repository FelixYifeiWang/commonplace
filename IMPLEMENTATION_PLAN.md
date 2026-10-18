# Morning test build

Scope: finish the merged Story/Gallery direction, keep the original grid behind Cmd/Ctrl+Shift+G, preserve user data and existing subscriptions, and verify local and hosted paths. No new permissions, dependencies, or image uploads to the model.

## Stage 1: Reliable generation and storage
**Goal**: Wire the session generator into both workers with safe continuation, old-story fallback, and durable storage.
**Success Criteria**: New updates retain prior context; noise cannot stall cursors; stale workers cannot overwrite a newer story; deletion does not restore media.
**Tests**: Batch continuation, historical evidence, noise-only batches, lease/replay/deletion/store regression tests.
**Status**: Complete

## Stage 2: Story canvases and Gallery map
**Goal**: Render the merged design with concise copy, shared sheets, proportional media, and useful pan/zoom/detail interactions.
**Success Criteria**: Gallery is the map, Story has consistent canvases, the old grid remains accessible by hotkey, mobile and keyboard paths work.
**Tests**: Layout/zoom math, browser checks of actual generated content and edge states.
**Status**: Complete

## Stage 3: Capture and companion reliability
**Goal**: Audit setup, targeting, previews, ongoing capture, and media deletion; fix demonstrated failures.
**Success Criteria**: No drag regression, missing bundle imports, permission requirements, or resurrected deleted media; preview failures have usable fallbacks.
**Tests**: Existing connector/setup/capture tests, native checks, isolated end-to-end fixtures.
**Status**: Complete

## Stage 4: End-to-end polish
**Goal**: Test the complete journey and correct visual, loading, error, accessibility, and performance issues.
**Success Criteria**: Connect/import/update/story/map/manual-add/delete/disconnect flows behave coherently. Existing user content stays intact.
**Tests**: Local API suites, real GPT-6 Luna fixture continuation, desktop and mobile browser QA.
**Status**: Complete

## Stage 5: Release and morning handoff
**Goal**: Commit tested changes, migrate safely, deploy, restart local services, and document what to test.
**Success Criteria**: Production and local agree, checks pass, secrets excluded, known limits documented honestly.
**Tests**: Full unit/lint/type/build, hosted integration checks and deployed smoke test.
**Status**: In Progress
