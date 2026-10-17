# Commonplace

A first draft of a shared home for ideas from human–AI conversations.

## Try it

Open `Start Commonplace.command` on this Mac, then visit http://127.0.0.1:3100/?demo=1 for the example collection. The desktop companion opens alongside it. The Example link opens your own space. Local sign-in uses a development identity; hosted sign-in uses ChatGPT.

The collection starts with a picker, square blocks, an add button, and the buddy. Click a block for its contents and source. Click the buddy for connection, session, and account controls.

## Connection routes

- **Desktop:** open the companion, connect it to your space, then select a Codex or Claude Code conversation. Read once or follow new turns while the companion runs. It checks the selected transcript every 15 seconds; the webpage refreshes every four seconds.
- **Coding agent:** copy the setup sentence from Connect. The current implementation imports a conversation once through a scoped API token. Automatic setup of a persistent local connector is planned; this draft does not claim an agent keeps monitoring after its turn ends.

Both routes use the same device/subscription APIs. A device token is scoped to writes for its owner; pause stops ingestion and revocation disables the device. Server tokens are hashed; desktop credentials are encrypted using Electron safeStorage. Only explicitly selected transcripts are uploaded.

## What this draft does

Collections, manual blocks, source passages, account sign-in, revocable connections, session controls, duplicate-resistant imports, JSONL parsing, and a floating Electron companion. Captured URLs become reference blocks. Transcript turns are stored for later AI processing.

## Unfinished

Hosted AI extraction is not configured. The example thoughts are sample content, not a live extraction. Cursor is supported for agent-provided API imports, not automatic local discovery. Dragging the buddy onto an arbitrary window cannot identify a conversation yet; use the session picker. There is no signed desktop installer or mind map yet.

The private hosted preview has an additional Sites authentication boundary. A device API token alone does not bypass it. Desktop hosted sign-in and unattended hosted syncing need further validation; local companion syncing is the tested development path.

## Development

React 19, TypeScript, Vinext (Next App Router compatibility), Cloudflare Workers, D1/Drizzle, Electron. Node >=22.13.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 3100
# Another terminal:
npm run desktop
```

The checked-out local D1 migrations have already been applied. A fresh checkout needs a build and the `drizzle/` migrations applied to its local DB binding. Never commit `.wrangler/`, `.sites-runtime/`, or credentials.

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

Verification: protocol and collector tests; local API checks for import, replay, malformed URLs, device isolation, pause/resume, and revocation; browser collection/detail checks; native companion launch. Test API fixtures were removed afterward.
