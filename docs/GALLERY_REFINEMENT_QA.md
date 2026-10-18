# Gallery, visual stories and buddy refinement

Verified on production Vercel, 2026-10-18. No local web server or local web test run.

## Changes

- Expanded stack covers and members share one grid. Covers retain their position and keyboard focus; a dark Fold badge marks the cover.
- Shared URL policy excludes authentication, personal inboxes, private agent conversations (including Claude Design), and ambient browser-only URLs. Public shares and documentation remain sources. Existing saved noise is hidden without changing agent histories.
- Story and Map instructions favor short, concrete language and relevant media from the full available catalog. Previously processed sources remain available for later visual connections. No paid classifier is needed for navigation filtering.
- Initial generation shows one status message. Existing content stays visible during updates.
- Account-owned collection favorites persist and sort before recent collections, in the picker and overview.
- Buddy controls reveal on hover or click. The button is closer, with a continuous pointer corridor and 280 ms leave grace. Dragging suppresses reopening until the pointer leaves. Keyboard activation stays open until pointer entry or Escape.

## Verification

- Vercel build: 227 tests passed, ESLint clean, TypeScript and production build passed.
- Production Gallery: expanded cover geometry identical; first member occupies the next free cell on the same row. Focus retained; Enter folds the stack.
- Production favorites: star moves collection first, persists after reload, and can be removed. Test favorite restored to its initial state.
- Existing collection: 11 Claude Design session links excluded; other research blocks remain.
- Real hosted GPT-6 Luna fixture: 3 intentional sources retained; inbox, auth, private session and ambient-only URLs excluded. Initial Story and Map each referenced 3 media. Continuation added a second step and retained 3 Story references. Synthetic test owner and all fixtures removed.
- Native installed buddy: correct production renderer, closer button, click reveal and pointer-gap interaction checked. Off-center drag moved exactly +50,+25, then returned to the original position; subscription count unchanged. Hover state, dismissal grace, keyboard activation and drag suppression have deterministic regression coverage.

## Scope

URL filtering is deterministic. It does not classify the semantic relevance of every ordinary public page. Prompt improvements apply on the next generation; existing Story prose is not rewritten by this deployment.
