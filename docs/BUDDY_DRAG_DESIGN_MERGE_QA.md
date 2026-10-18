# Buddy drag and designer merge

## Changes

- The native grab region now matches the full rendered button, including its upper padding.
- Native cursor hit testing owns click-through state. Delayed renderer hover messages cannot disable the buddy.
- Connection processing no longer disables moving the buddy.
- Mouse events without global coordinates use their local coordinates and current window bounds.
- Integrated `jin-sxk/commonplace:story-gallery-ui-polish` through `acf01e2`.
- Resolved the sole textual conflict in `lib/map-layout.mjs` by using the designer's shared ring distance in layout and drag offsets.
- Retained current collection actions, evidence handling, automatic names, and uncropped media. Kept the new status indicator monochrome and combined map hover styling without a background flash.

## Verification

- Buddy-only Vercel build: 241 tests passed, lint and production compilation passed.
- Installed release: `5ebf747033b0aeb3c8ccb1ba0454a9ce22f30380fab49f9dd60052419fdfebff`.
- Native upper-padding drag from `(34,66)` by `(50,-25)` changed persisted window position from `(1082,702)` to `(1132,677)`. Reverse drag restored `(1082,702)`.
- Native off-center face drag from `(34,98)` by `(60,20)` produced `(1142,722)`. Reverse drag restored the original position.
- All six existing subscriptions and encrypted pairing were preserved. Dragging did not connect a session.
- Designer merge Vercel test run: 244 tests passed, including pinned map dragging, continuous neighbor displacement, and edge endpoints.
- No local web server or mock data seed was run.

## Follow-up visual merge audit

The first merge preserved all designer commits but also retained older main-branch Map rules at the end of the stylesheet. Their specificity and source order masked the designer's gray sheet surfaces, serif text, centered captions, and spacing. The first visual review did not catch this mismatch.

Removed those 69 lines of Map presentation overrides. The designer stylesheet is now preserved verbatim except for the status dot's intentional monochrome color. No appended selectors override Map or Story presentation. The session renderer and Map layout files match the designer branch exactly. Favorites, deletion, gallery grouping, anchored navigation, and native buddy fixes remain.

Re-fetched every published branch in the origin and designer fork. All five branch heads are ancestors of main; there are no remaining unmerged commits in those repositories. Vercel's Git deployment of the original merge also succeeded, so the mismatch was not an old deployment.

Correction verified in production: Map cards now compute to the designer's gray gradient and 9px radius, captions are centered, and quotes use Georgia. The previous deployment computed white backgrounds, 5px corners, left captions, and DM Sans. The remote build passed all 244 tests, lint, and TypeScript compilation.
