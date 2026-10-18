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
