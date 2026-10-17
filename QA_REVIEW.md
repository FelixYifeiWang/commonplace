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

## Story view — 17 October 2026

- Verified a per-channel Gallery/Story switch, existing gallery preservation, connected media opening the existing detail viewer, and expandable source quotes.
- Reviewed the quiet timeline and connected-thumbnail canvas at desktop width and 390 × 844. No horizontal overflow; viewport override reset. Reduced-motion styling is included.
- All seven currently connected channels completed real GPT-6 Luna generation. Invalid paraphrased evidence is rejected and gets one bounded corrective attempt, with valid source IDs constrained in the output schema.
- A live temporary channel generated its first story, appended after a new gallery note, and retained earlier beat records byte-for-byte. Deleting media preserved the narrative and did not trigger rewriting. Fixtures were removed.
- Durable queue tests cover updates during generation, exclusive leases, replay, expired workers, deletion, and failures retaining checkpoints. Long turns continue across batches; credential redaction happens before slicing to avoid leaking split secrets.
- 93 unit tests, typecheck, lint, production build and both local API integration suites passed. Wrangler SQL splitting was tested against the migration. The configured key is ignored by Git and absent from source files and built browser assets.

Automatic generation requires the local server to stay running. The production build intentionally does not contain a hosted story worker. Graph relationships use supplied transcript/media metadata; this version does not perform image vision or provide a freely editable graph canvas.

## Vercel deployment — 17 October 2026

- Production: https://commonplace-pearl.vercel.app. Private access-code sign-in; anonymous requests and forged Sites identity headers are rejected. The configured OpenAI key stays server-side.
- Turso Starter migrations applied; live adapter checks verified atomic rollback and ordered result columns. Local D1 data was not uploaded.
- Real GPT-6 Luna generation ran after gallery changes without visiting Story. A second update appended new moments while preserving earlier records exactly.
- OIDC-backed presigned Blob upload, authenticated file delivery, byte ranges and channel/block deletion passed on production. Temporary database fixtures were removed. One private 27-byte upload fixture remains unreferenced: local cleanup was blocked by Blob OIDC environment permissions.
- Reviewed the deployed minimal entry page and access-code form in the browser. Hosted authenticated data flows were verified through HTTP integration tests.
- 95 unit tests, ESLint, typecheck, local Vinext build, Vercel Next production build and live local API regression checks passed. The local server was restarted successfully after the runtime split.
- No configured secret values were found in publishable source files or the deployed page's browser scripts. Environment files, local databases and companion binaries are excluded from CLI uploads and Git.

Hosted cards currently use metadata covers; full-page screenshot capture remains a local feature. The companion was not switched to the hosted destination, so existing subscriptions continue writing locally. Hosted Story work is bounded per invocation with durable checkpoints and daily recovery; very long imports may continue on a subsequent update or Story visit.

QA cleanup limitation: CLI attempts exposed missing paired OIDC/store configuration and a development-environment authorization error. Adding a development connection did not resolve the provider authorization; the direct SDK returned the same error. Cleanup was stopped rather than changing production permissions. The fixture contains only “Commonplace hosted upload QA” and is absent from the gallery.
