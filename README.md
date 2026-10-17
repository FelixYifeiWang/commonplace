# Commonplace

A first draft of a shared home for ideas from human–AI conversations.

## Try it

Open `Start Commonplace.command` on this Mac, then visit http://127.0.0.1:3100/ for your local space. The desktop buddy opens alongside it. Open a conversation in a single Codex window and move the desktop buddy over the conversation area, click it, then click Connect. Dragging only moves the buddy. Local sign-in uses a development identity. The optional sample collection is at `/?demo=1`.

The collection starts with a picker, square blocks, and an add button. Click a block for its contents and source. The buddy only appears on the desktop. The collection menu includes connection and account controls.

## Connection routes

- **Desktop (macOS preview):** open one Codex window, open the conversation, then move the buddy over the conversation area, click it and choose Connect. It connects and follows new turns while the companion runs. No Accessibility or screen-recording permission is requested. It checks the selected transcript every 15 seconds; the webpage refreshes every four seconds.
- **Coding agent:** copy the setup sentence from Connect. The current implementation imports a conversation once through a scoped API token. Automatic setup of a persistent local connector is planned; this draft does not claim an agent keeps monitoring after its turn ends.

Both routes use the same device/subscription APIs. A device token is scoped to writes for its owner; pause stops ingestion and revocation disables the device. Server tokens are hashed; desktop credentials are encrypted using Electron safeStorage. Only explicitly selected transcripts are uploaded.

## What this draft does

Collections, manual blocks, source passages, account sign-in, revocable connections, session controls, duplicate-resistant imports, JSONL parsing, and a floating Electron companion. Each connected session gets a collection named after it, and All items combines every collection. Captured URLs become reference blocks with locally rendered page screenshots, cover fallbacks and media viewers. The default grid stacks pages by website; click a stack to expand inline, then click its cover to fold. Media keeps its proportions inside aligned cells. Search and type/source filters work inside stacks. Select blocks to delete with Undo; sync preserves deletion markers. The first empty tile accepts text, links and dropped/pasted files. The searchable collection picker can delete and disconnect channels. Sign-in and callback URLs are excluded. Transcript turns are stored for later AI processing.

## Unfinished

Hosted AI extraction is not configured. The example collection is sample content, not a live extraction. Direct connection currently supports Codex only. Inactive sidebar rows must be opened first. Claude Code and Cursor feasibility findings are in `COMPATIBILITY.md`; they are not yet connected to the connection handler. There is no signed desktop installer or mind map yet.

The private hosted preview has an additional Sites authentication boundary. A device API token alone does not bypass it. Desktop hosted sign-in and unattended hosted syncing need further validation; local companion syncing is the tested development path.

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
