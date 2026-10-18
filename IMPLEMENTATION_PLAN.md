# Tonight: Story + Gallery frontend, merged with Felix's backend, as a pull request

Goal: finish the frontend for Story and Gallery, bring in Felix's newer backend work (`origin/main` on FelixYifeiWang/commonplace), and open a pull request. The work stays on a feature branch, and nothing goes to `main` directly. Expect a few rounds of iteration on the mockup and the app before anything is committed or pushed. Each commit and the push wait for an explicit go-ahead.

Design references:
- `STORY_CANVAS.md`
- mockup: https://claude.ai/artifact/PkxxssFTMZtnyjsktQMNM4 (Gallery: `#gallery`)

## Stage 1: Generation contract (prompt, schema, validation)
**Goal**: One model call per batch returns the whole story (at most 5 steps) and the session map. The prompt has no session-specific rules, so it fits any coding session.
**Success criteria**:
- `lib/story.mjs` exports `sessionInstructions`, `sessionSchema` and `validateSession(output, input)`.
- The validator rejects:
  - unknown item IDs or URLs
  - unverifiable quotes
  - aggregate labels such as "4 fixes"
  - more than 5 steps
  - map nodes that are empty or duplicated
**Tests**: `tests/story.test.mjs`, covering:
- a valid story and map
- a wrong item ID
- a URL that isn't in the input
- an aggregate label
- a quote that isn't in the source
- a sixth step
- a cross-link to a missing node
**Status**: Complete. The contract is tested in `tests/session-contract.test.mjs` and `tests/session-pipeline.test.mjs`, and `generateSession` in `lib/story-provider.mjs` makes the call. A live run on a Codex session works (about 20 s per call). Not yet wired in: the job runner and the store saving a whole story and map instead of appended beats (Stage 2b).

## Stage 2: Merge Felix's backend
**Goal**: A feature branch (for example `story-gallery-redesign`) contains `origin/main` plus the uncommitted Claude Code connector work.
**Success criteria**:
- The branch is cut from the current local `main`.
- The connector work is committed on its own.
- `origin/main` is merged in and the 7 conflicting files are resolved: README.md, COMPATIBILITY.md, app/buddy/page.tsx, components/workspace.tsx, desktop/collector.mjs, desktop/main.mjs, lib/protocol.mjs.
- `npm test`, `npm run typecheck` and `npm run lint` pass on Node 22.
- Migration 0006 is applied to the local database.
**Tests**: existing suites, plus Felix's new setup, pairing and installer tests.
**Status**: In Progress (branch `story-gallery-redesign`, committed locally; nothing pushed)

## Stage 2b: Wire the pipeline (after the merge)
**Goal**: Steps 2, 4, 5 and 7 of "How a story and gallery get made" in `STORY_CANVAS.md`.
**Success criteria**:
- Pasted images in user turns become `fromHuman` items.
- The shipped URL is captured at desktop and phone sizes.
- Each picture is fitted once (kind, edge colour, trim, cut-out).
- A new migration after Felix's 0006 stores the whole story and gallery per channel.
- The job runner calls `prepareSessionBatch` and `generateSession`.
- The collector skips Codex sub-sessions (`session_meta.payload.source.subagent`, such as guardian approval reviews): they are agent-to-agent, not the human's conversation.
**Tests**: collector image parsing; the fitting run in the worker (fixture images); store replace semantics; one paid integration run with your OK.
**Status**: Not Started

## Stage 3: Story view
**Goal**: `components/story-view.tsx` renders steps as in the mockup:
- the step label and date
- a casual title
- one paragraph in the user's voice
- a 16:10 canvas drawn as a grey sheet that blurs toward the bottom
**Success criteria**:
- Canvas variants are chosen by the renderer from item count and shape.
- Objects are never cropped.
- Sketches blend into the canvas.
- Light and dark mode both work.
**Tests**: variant selection and object-or-page fitting as pure functions; one browser check of the local app.
**Status**: Not Started

## Stage 3b: Shared shell
**Goal**: The nav pill holds the session switcher (the channel name opens a menu of coding sessions), the Gallery and Story tabs, and the light/dark toggle. The switcher reuses the existing `components/collection-picker.tsx` data and actions in the new menu style. Story and Gallery share one sheet component and one dot field (see "One sheet everywhere" in `STORY_CANVAS.md`).
**Status**: Not Started

## Stage 4: Gallery session map
**Goal**: A Gallery tab in do's layout:
- the session's output in the center
- up to six tiles evenly spaced, each with a summary bubble
- 1–3 details pop out on zoom, with the human's quotes up close

The Gallery is not the Story. It collects what is worth keeping from the session: the look and its rules, key components, references with what was liked about each, principles, and strong choices. It has no links to Story steps.
**Success criteria**:
- Clicking a reference opens its site.
- There is no pop-up, no filter column and no count-style text.
- Every node comes from the model's `map.nodes` output.
- Dragging, zooming and pinching match the mockup.
- No overlaps at any zoom level.
**Tests**: the layout (even spacing, sectors, collision pass) as a pure function; one browser check.
**Status**: Not Started

## Stage 5: Verify and open the pull request
**Goal**: Everything builds, and a pull request against `origin/main` is open for Felix to review.
**Success criteria**:
- `npm test`, `npm run typecheck`, `npm run lint` and `npm run build` pass.
- `node tests/story.integration.mjs` passes against a local server (paid API call, run only with your OK).
- The feature branch is pushed and a PR is opened against `main`. Its description covers:
  - the redesign
  - the new generation contract
  - the connector work
  - anything Felix should check, such as the buddy changes that touched the same files
**Status**: Not Started (push and PR need your go-ahead)
