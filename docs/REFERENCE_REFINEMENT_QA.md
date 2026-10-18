# Collection controls, visual refresh and buddy references

Production verification, 2026-10-18. Web tests ran on Vercel, with no local web server or local web test run.

## Shipped behavior

- Favorites update immediately, survive background refresh, roll back on failure, and have an atomic five-collection server limit. Star and delete actions share hover/focus styling; delete is red.
- Gallery stacks expand inline without moving the cover. Thin outlines follow occupied rows. Member media retain ordinary borderless art and captions. Individual items have hover delete with the existing Undo and tombstone behavior.
- The view switch is centered independently of collection title and actions. The redundant header Add block action is removed; the empty Gallery tile remains.
- Map cards have clear white surfaces, uncropped references, tighter spacing and legible labels when zoomed out.
- A durable visual refresh updates existing canvases and Map references while preserving Story titles, text, evidence and order. New conversation turns still advance the story normally.
- Every generation reconsiders the project name. Session-backed collections adopt it in the same lease-guarded transaction as the generated views. Manually created collection names remain user-controlled.
- Evidence selection offers exact excerpts, handles visible Markdown and quotation typography, and retries malformed output. Fabricated or changed wording is still rejected. Raw source IDs and validation internals are replaced with a brief retry message.
- The buddy uses a separate panel, leaving its face window and drag origin unchanged. It appears only for a resolved supported target. Up to five starred collections appear above Connect. Clicking copies filtered collection references; it does not send a message or subscribe the session.

## Verification

- Final Vercel build: 238 tests passed, ESLint clean, TypeScript and production build passed.
- Hosted device-reference tests: five results, useful source context, noise filtering, owner isolation, invalid/revoked credentials rejected, no subscription side effects. Isolated fixtures removed.
- Real hosted GPT-6 Luna: three deliberate references in Story and Map; project name propagated to the collection; continuation retained three media and added a second step. Isolated fixtures removed.
- Existing collections refreshed successfully after older in-flight workers finished. The final refresh preserved Story prose in all three collections. Map/Story keep only supported relationships; collections with few relevant media can still contain text nodes.
- Production UI: star toggled and reordered immediately, persisted after reload, then restored to initial state. Actions hidden at rest. Stack cover retained exact bounds (x 775.59, y 193, width 219.20, height 275) after expansion; its first member occupied the next cell. View switch retained exact bounds between Gallery and Map.
- A disposable collection was created through the UI, a note added through the empty tile, deleted with its individual action, and restored with Undo. The test collection was then deleted through the UI.
- Installed buddy updated from the production manifest with verified hashes and existing encrypted pairing retained. Off-center drag moved exactly +50,-25 and returned to its starting position. All five existing subscriptions remained unchanged. Unsupported target showed only the face.

## Remaining manual check

Computer-use policy blocks automating the Codex app. Supported-target detection and Connect have regression coverage, and the live reference API passed, but the final native reference-button click over a Codex conversation was not automated in this pass. Test it by hovering the buddy over an open supported session, then clicking a starred collection and pasting the copied prompt.
