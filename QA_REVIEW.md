# Local UI review — 17 October 2026

Reviewed at http://127.0.0.1:3100/ in the in-app browser and in the Electron companion. Compared the public Are.na Press channel and block documentation. Existing user collections and transcripts were preserved; only our disposable test collection, blocks and uploaded file were removed.

## Verified

- Desktop gallery and 390 × 844 layout: aligned cells, proportional media, readable captions, no horizontal overflow. Temporary viewport override reset.
- Domain stacks expand within the canvas, retain surrounding blocks and fold through the same cover; no navigation.
- Collection search, switching, empty collection, first-tile text entry, disabled empty save, local image upload, detail viewer, selection deletion and Undo.
- Channel deletion returns to All items; Undo restores its content without resubscribing. API checks verify capture is rejected until explicit reconnect.
- Domain filtering and clearing filters; auth/callback source policy also covers historical gallery results, capture, manual save and structured ingest.
- Deleted media stays absent after replay and structured updates; new references still arrive. Explicit restore works. A later explicit connection restores a deleted channel.
- Buddy has no mouth; click shows only a Connect control. Drag keeps the buddy visible and collapses the control without connection feedback. Unit tests cover final movement deltas, IPC delay, anchor preservation and explicit connection success/failure.
- The reported Notion detail now displays its cover instead of a loading-only screenshot. Public page screenshots load successfully for supported sources; unavailable pages retain fallback content. Blank/tiny-spinner bitmap rejection and compressed resource/font handling have regression tests.
- Fresh gallery load produced no browser console errors during the final check.

## Validation and limits

72 unit tests, typecheck, ESLint and production build passed. The live local API integration suite passed and cleaned its fixtures.

Actual live Codex connection still needs a user check with one Codex window open. This review tested movement and controls in Electron plus connection lifecycle fixtures; it did not bypass denied access to Codex. Claude Code and Cursor remain unimplemented adapters.

Hover GIF/direct-video/YouTube/Vimeo playback and reduced-motion behavior were implemented and reviewed in code; provider autoplay was not exercised end-to-end in this browser run. Website motion is a screenshot pan/zoom, not a live website. Readiness checks cannot guarantee every external site will render; slow, private or blocked pages use a cover or text fallback.
