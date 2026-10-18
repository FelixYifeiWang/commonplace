# Onboarding verification

October 18, 2026. Web checks ran against https://commonplace-pearl.vercel.app. No local web server was started.

## Changes

- Setup has one copy action, a waiting state, expiration recovery, and a confirmed completion state with the next step.
- A device acknowledges setup only after pairing is saved. A connection acknowledges only after its first capture succeeds. Setup itself never reads a transcript or creates a collection.
- Dialogs focus the first field or primary action.
- The Mac launcher is named Commonplace, has a mouthless black-and-white buddy icon, and appears in the user's Applications folder.
- The runtime has focused recovery actions and a branded About dialog. Changing its display name preserves the original credential encryption service.
- Startup opens the buddy directly. Account sign-in stays in the browser; an unpaired buddy offers Set up.
- Installation retries a deployment checksum transition once and the transient macOS service teardown error twice. Permission failures are not retried or bypassed.

## Verified

| Flow | Evidence |
| --- | --- |
| Sign in and out | Actual Google account chooser, return to the existing workspace, and sign-out on production. Hosted checks also verify PKCE, basic identity scopes, callback/origin checks and rejection of forged/legacy credentials. |
| Copy setup | Production Copy prompt reaches the waiting state. Pasting into an unsaved field confirms the complete one-line prompt; its private code was not logged or saved. |
| Fresh pairing | Isolated hosted owner fixture pairs, receives ready acknowledgment, creates no collection, never reads a transcript, and rejects replay. |
| Choose a meaningful session | The actual source finder and validator resolve a private connection prompt from synthetic Codex, Claude Code and Cursor transcript folders. No user history is read by the QA harness. |
| Subscribe and update | For each provider, initial capture creates one collection, an appended turn arrives once, replay is deduplicated, and reconnect reuses the collection/device. Setup codes are redacted before upload. |
| Delete and disconnect | UI block deletion and Undo work. UI collection deletion removes its tile. Hosted tests verify tombstones survive replay, paused sessions reject writes, and revoked devices cannot connect. |
| Manual collection | Create, add a text block, Gallery/Map/Story, selection, deletion and recovery were exercised in the production browser. |
| Installed buddy | An actual empty native profile shows Set up, pairs through the hosted API, encrypts its key, acknowledges readiness without a collection, and restores pairing after a cold restart. The production upgrade preserves credentials and subscriptions. An off-center drag moves exactly +120/+40 pixels, settles at that position, and does not connect. Hide removes the window; the reveal inbox restores it. |
| Distribution integrity | Every published file, including the native helper and icon assets, matches the release manifest's length and SHA-256 hash. |

Remote Vercel checks: 218 tests, ESLint, TypeScript and production compilation. Installer tests cover first installation, repeated setup, incomplete runtimes, default URL handler verification, service retry, and preserving an existing Applications entry.

The hosted transcript harness is `tests/onboarding-hosted.integration.mjs`. It requires the hosted HTTPS URL and Turso credentials, creates unique disposable records, and removes only its own fixtures in `finally`. It may trigger the app's normal hosted reasoning. Deletion/pause state in this harness is set directly in the fixture database; the authenticated deletion UI is checked separately above.

## Verification limits and remaining distribution work

- A brand-new Google identity and a clean physical Mac were not created for this run. First-install OS operations are tested with process fixtures; the actual Mac check covers an empty app profile, real pairing and restart, upgrade, preserved pairing, and native interaction.
- Browser automation blocks the `commonplace://` handoff. The registered handler and reveal mechanism are verified, but the final browser permission/launch click needs a manual check.
- Cursor and terminal Claude Code connect through the prompt. Native point-and-connect is limited to supported Codex and Claude desktop conversations.
- macOS still names the underlying development Electron process/menu Electron. The launcher, icon and About content are Commonplace. Removing the remaining OS-level runtime name requires distributing a properly packaged application; changing `app.setName` alone does not change the OS identity. See [Electron's app-name documentation](https://www.electronjs.org/docs/latest/api/app#appsetnamename).
- The browser tool's viewport override did not change the rendered viewport, so this run does not claim mobile visual verification.

## Cleanup

Temporary hosted owner fixtures and the browser-created QA collection are removed. Obsolete local build outputs and unused installed releases are removed after final verification. The active runtime, original session histories, collections, local database, credentials, and repository remain intact.
