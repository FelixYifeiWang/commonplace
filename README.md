# Commonplace

A first draft of a shared home for ideas from human–AI conversations.

## Try it

Open `Start Commonplace.command` on this Mac, then visit http://127.0.0.1:3100/ for your local space. The desktop buddy opens alongside it. Open a conversation in a single Codex window and move the desktop buddy over the conversation area, click it, then click Connect. Dragging only moves the buddy. Local sign-in uses a development identity. The optional sample collection is at `/?demo=1`.

The collection starts with a picker, square blocks, and an add button. Click a block for its contents and source. The buddy only appears on the desktop. The collection menu includes connection and account controls.

## Connection routes

- **Desktop (macOS preview):** open one Codex window, open the conversation, then move the buddy over the conversation area, click it and choose Connect. It connects and follows new turns while the companion runs. No Accessibility or screen-recording permission is requested. It checks the selected transcript every 15 seconds; the webpage refreshes every four seconds.
- **Agent setup:** choose Set up buddy and paste the prompt into any local coding agent. Setup pairs and launches the buddy without reading the setup conversation or creating a collection. Then choose Connect a session and paste that separate prompt into a conversation worth saving. Codex can also connect through the buddy's Connect control over an open conversation. macOS 13+, Node.js 22.13+ and npm are required. A prebuilt helper avoids Xcode; cloud agents cannot install a laptop buddy.


Both routes use the same device/subscription APIs. A device token is scoped to writes for its owner; pause stops ingestion and revocation disables the device. Server tokens are hashed; desktop credentials are encrypted using Electron safeStorage. Only explicitly selected transcripts are uploaded.

## What this draft does

Collections, manual blocks, source passages, account sign-in, revocable connections, session controls, duplicate-resistant imports, JSONL parsing, and a floating Electron companion. Each connected session gets a collection named after it, and All items combines every collection. Captured URLs become reference blocks with locally rendered page screenshots, cover fallbacks and media viewers. The default grid stacks pages by website; click a stack to expand inline, then click its cover to fold. Media keeps its proportions inside aligned cells. Search and type/source filters work inside stacks. Select blocks to delete with Undo; sync preserves deletion markers. The first empty tile accepts text, links and dropped/pasted files. The searchable collection picker can delete and disconnect channels. Sign-in and callback URLs are excluded. Each channel also has a Story view: brief narrative moments with labeled connections to saved media, generated from its transcript and gallery.

## Unfinished

The example collection is sample content, not a live extraction. Clicking the desktop buddy to identify an open window currently supports Codex only. Inactive sidebar rows must be opened first. The setup-prompt route supports local Codex, Claude Code and Cursor JSONL transcripts; see `COMPATIBILITY.md`. There is no signed desktop installer or freely editable mind map yet.

The older Sites preview has an additional Sites authentication boundary. The Vercel deployment uses its own private access code. Desktop hosted sign-in and unattended hosted syncing still need an end-to-end companion check; local companion syncing is the tested development path.

## Development

React 19, TypeScript, Vinext (Next App Router compatibility), Cloudflare Workers, D1/Drizzle, Electron. Node >=22.13. The desktop buddy requires macOS and Xcode Command Line Tools (`swiftc`).

```sh
npm ci
# First run on a fresh clone: build the local Worker config and initialize the database.
npm run build
for migration in drizzle/*.sql; do
  npx wrangler d1 execute DB --config dist/server/wrangler.json --local --persist-to .wrangler/state --file "$migration"
done
npm run local
# Another terminal:
npm run desktop
```

`local` keeps live code replacement off and uses a separate optimizer cache. Restart it after code changes. For active editing with hot reload, use `npm run dev -- --host 127.0.0.1 --port 3100` instead. Collection updates still arrive normally in local mode.

Run the initialization loop only against a new, empty database. On later launches use `Start Commonplace.command` or `npm run local` and `npm run desktop`. Session data, device credentials, dependencies, and build outputs are local-only and are excluded from Git. Never commit `.wrangler/`, `.sites-runtime/`, or credentials.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Verification: protocol, collector, move/connect lifecycle, and media-preview tests; local API checks for import, replay, malformed URLs, device isolation, pause/resume, and revocation; browser collection/detail checks; native companion launch. Test API fixtures were removed afterward.

## How connection works

The local helper reads window geometry and the owning process, never screen pixels or window titles. Codex navigation logs identify the open conversation; its ID resolves to a transcript in the local session index. Dragging always repositions the visible buddy. Clicking opens one Connect/Connected control; connection requires an explicit click. Ambiguous windows, sidebar locations, and missing navigation records do not upload anything. This uses undocumented local formats and may require updates after Codex upgrades. A browser alone cannot access this local state; the preview still runs a local Electron companion.

An explicit connection shows a screen-wide ripple, then connection/import status. The green Connected result appears after the initial transcript capture succeeds. The overlay ignores pointer input. Public webpage screenshots and covers are captured while the local collection page is open; a source may still appear as a text card if it blocks previews or supplies no cover. The mouthless buddy has a single connection control, cursor-aware eyes and reduced-motion support. Expanding its control preserves its face position, including at the bottom of a display. See `ARENA_REFERENCE.md` for media behavior and limits.

The `drizzle/0002_yellow_freak.sql` migration separates existing sessions into named collections and preserves their blocks. The `drizzle/0003_tough_gladiator.sql` migration adds named groups and local file references without changing existing blocks. The `drizzle/0004_pretty_sally_floyd.sql` migration adds reversible deletion markers. Channel deletion revokes capture; Undo restores the channel but leaves it disconnected. Explicitly connecting again restores and resumes that channel while preserving deleted-block markers. Apply only migrations not already present on an existing database. Run `node tests/local-api.integration.mjs` against the local preview for collection, grouping and media checks; it removes its own temporary fixtures.

## Channel stories

Choose a channel, then **Story**. New transcript turns and gallery edits queue a continuation automatically; opening the Story tab is not required. Keep `npm run local` running. The buddy must also run for subscribed session capture.

Set `OPENAI_API_KEY` in the ignored `.env.local` file. The local worker reads it for each job and uses `gpt-6-luna` via the OpenAI Responses API with provider storage disabled. The key stays server-side. Session text and media metadata are sent to OpenAI after credential redaction; images themselves are not sent. Reference arrows describe relationships supported by the transcript, rather than inferring visual details from thumbnails.

Migration `0005_lucky_frightful_four.sql` adds durable story checkpoints, append-only moments and queue triggers. Changes coalesce briefly before generation. Earlier moments remain unchanged; updates received during generation stay queued. Deleted media disappears from diagrams without altering earlier prose. Deleted channels stop processing. A failed generation preserves its checkpoint and can be retried from Story.

Run `node tests/story.integration.mjs` against the local server with a valid key to test real generation, continuation and deletion. It makes paid API requests for its own temporary collection, verifies earlier moments are unchanged, then removes its fixtures.

## Vercel deployment

The hosted app uses Next.js, Turso SQLite and private Vercel Blob. Local Vinext/D1 and the desktop companion remain available without migrating or uploading existing laptop data. The hosted space starts empty.

Production configuration (server-side): `COMMONPLACE_HOSTED=1`, `OPENAI_API_KEY`, `COMMONPLACE_ACCESS_CODE`, `COMMONPLACE_SESSION_SECRET`, `CRON_SECRET`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `BLOB_STORE_ID` and `BLOB_WEBHOOK_PUBLIC_KEY`. Generate strong random access/session/cron secrets and keep them outside Git. The current private prototype has one shared owner space protected by an access code; it is not a multi-user account system.

```sh
# With hosted database credentials loaded securely into the environment:
npm run db:migrate:hosted
COMMONPLACE_HOSTED=1 npm run build:vercel
vercel deploy --prod
```

The migration runner records applied SQL files and batches each migration atomically. Hosted uploads use scoped presigned URLs and OIDC, then authenticated file delivery. The OpenAI key is only used by server functions. Source changes schedule background Story work after the response; durable leases and checkpoints prevent duplicate continuations. Each invocation is bounded; pending work resumes on subsequent updates, Story visits, or the daily recovery cron. Very long imports may need more than one invocation.

Hosted website cards use metadata covers. The native browser screenshot renderer remains local. No Electron or session-history reader runs on Vercel. To connect to the hosted space, copy its setup prompt and paste it into a local agent. The pairing link selects that destination; existing local subscriptions are not migrated.

Vercel Hobby and Turso Starter were selected for the prototype; OpenAI requests consume paid API credits. No paid infrastructure plan is required for this deployment. Monitor each provider's free quotas before scaling.

`tests/hosted.integration.mjs` is an explicit live check using `COMMONPLACE_TEST_URL`, the access code, and hosted database credentials from the environment. It verifies authentication, automatic GPT-6 Luna continuation, direct private uploads, downloads, byte ranges and deletion, then removes only its database fixtures. It makes paid model calls; remove its reported Blob fixture with the Vercel CLI afterward.

## One-prompt setup internals

`/setup.md` serves the full agent instructions as Markdown. The copied prompt is only `Set up <private setup.md link>`. `/setup` and `/SKILL.md` remain compatible aliases. An authenticated copy action issues a single-use, 30-minute pairing code in a URL fragment. The setup link only installs and pairs. A separate `/connect` link identifies an explicitly selected conversation through its local user message; ambiguous matches fail rather than guessing. Only this explicit connection subscribes a transcript. Setup links are redacted before ingestion.

The client-only release at `/companion/` is generated by `npm run companion:package` before local and hosted builds. Its manifest carries SHA-256 hashes; the Electron dependency is pinned with npm integrity checks. The committed universal helper in `desktop/release/` is built from `desktop/native/Target.swift`; it is ad-hoc signed, not a notarized app distribution. Device keys are encrypted by Electron; setup request files are removed after processing. No MCP servers, hooks, global packages or agent settings are installed.

The per-space installation lives in `~/Library/Application Support/Commonplace/<space-id>`. Its generated `uninstall.mjs` stops automatic launch while retaining saved collections and local credentials. Connections settings can revoke the device. A full fresh-Mac install still needs real-world validation; tests exercise the installer with process launch mocked and all three providers with disposable transcripts through the real API.

### Setup revision

Setup does not create the first collection. It launches the buddy and gives a short next step. Connection prompts remain separate and work across local Codex, Claude Code and Cursor JSONL formats.

Electron 44.9.0 has an on-demand binary installer. After `npm ci`, the installer runs Electron's official `install.js` and verifies the executable, plist and framework before registering a LaunchAgent. A reported macOS App Management denial during extraction remains unresolved on the affected Mac. The app does not change permissions or instruct users to grant broad App Management access as normal onboarding. A signed, notarized distribution remains future work; do not claim permission-free installation.
