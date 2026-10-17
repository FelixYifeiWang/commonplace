# Commonplace

A first draft of a shared home for ideas from human–AI conversations.

## Try it

Open `Start Commonplace.command` on this Mac, then visit http://127.0.0.1:3100/ for your local space. The desktop buddy opens alongside it. Open a conversation in a single Codex window and drag the desktop buddy over the conversation area to connect. Local sign-in uses a development identity. The optional sample collection is at `/?demo=1`.

The collection starts with a picker, square blocks, and an add button. Click a block for its contents and source. The buddy only appears on the desktop. The collection menu includes connection and account controls.

## Connection routes

- **Desktop (macOS preview):** open one Codex window, open the conversation, then drag the buddy over the conversation area. It connects directly and follows new turns while the companion runs. No Accessibility or screen-recording permission is requested. It checks the selected transcript every 15 seconds; the webpage refreshes every four seconds.
- **Coding agent:** copy the setup sentence from Connect. The current implementation imports a conversation once through a scoped API token. Automatic setup of a persistent local connector is planned; this draft does not claim an agent keeps monitoring after its turn ends.

Both routes use the same device/subscription APIs. A device token is scoped to writes for its owner; pause stops ingestion and revocation disables the device. Server tokens are hashed; desktop credentials are encrypted using Electron safeStorage. Only explicitly selected transcripts are uploaded.

## What this draft does

Collections, manual blocks, source passages, account sign-in, revocable connections, session controls, duplicate-resistant imports, JSONL parsing, and a floating Electron companion. Each connected session gets a collection named after it, and All items combines every collection. Captured URLs become reference blocks with locally fetched covers and media viewers. Transcript turns are stored for later AI processing.

## Unfinished

Hosted AI extraction is not configured. The example collection is sample content, not a live extraction. Direct drops currently support Codex only. Inactive sidebar rows must be opened first. Claude Code and Cursor feasibility findings are in `COMPATIBILITY.md`; they are not yet connected to the drop handler. There is no signed desktop installer or mind map yet.

The private hosted preview has an additional Sites authentication boundary. A device API token alone does not bypass it. Desktop hosted sign-in and unattended hosted syncing need further validation; local companion syncing is the tested development path.

## Development

React 19, TypeScript, Vinext (Next App Router compatibility), Cloudflare Workers, D1/Drizzle, Electron. Node >=22.13.

```sh
npm ci
npm run local
# Another terminal:
npm run desktop
```

`local` keeps live code replacement off and uses a separate optimizer cache. Restart it after code changes. For active editing with hot reload, use `npm run dev -- --host 127.0.0.1 --port 3100` instead. Collection updates still arrive normally in local mode.

The checked-out local D1 migrations have already been applied. A fresh checkout needs a build and the `drizzle/` migrations applied to its local DB binding. Never commit `.wrangler/`, `.sites-runtime/`, or credentials.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Verification: protocol, collector, drop lifecycle, and media-preview tests; local API checks for import, replay, malformed URLs, device isolation, pause/resume, and revocation; browser collection/detail checks; native companion launch. Test API fixtures were removed afterward.

## How the drop works

The local helper reads window geometry and the owning process, never screen pixels or window titles. Codex navigation logs identify the open conversation; its ID resolves to a transcript in the local session index. Unsupported targets, ambiguous windows, sidebar drops, and missing navigation records fail without uploading. This uses undocumented local formats and may require updates after Codex upgrades. A browser alone cannot access this local state; the preview still runs a local Electron companion.

A successful drop shows a screen-wide ripple, then connection/import status. The green Connected result appears after the initial transcript capture succeeds. The overlay ignores pointer input. Public website covers are extracted while the local collection page is open; a source may still appear as a text card if it blocks previews or supplies no cover. See `ARENA_REFERENCE.md` for media behavior and limits.

The `drizzle/0002_yellow_freak.sql` migration separates existing sessions into named collections and preserves their blocks. Run `node tests/local-api.integration.mjs` against the local preview for collection/metadata checks; it removes its own temporary fixtures.
