# Morning test build

Updated October 18, 2026.

## Start here

Open [local Commonplace](http://127.0.0.1:3100/). The local server and buddy have been left running. If they have stopped, open `Start Commonplace.command` in the project folder.

[Hosted Commonplace](https://commonplace-pearl.vercel.app) is also deployed. Local and hosted collections are separate. Your existing data and subscriptions have been preserved.

1. Open a collection. **Gallery** is now the map. Drag the background to pan, drag a reference to move it, and scroll or use + to reveal more detail. The reset button restores the layout.
2. Switch to **Story** for the short narrative and visual canvases. Expand **From the session** to see the evidence.
3. Press **Cmd/Ctrl+Shift+G** for the original grid. The same shortcut returns to the map. Add, delete and Undo still work there. Deleting a saved block does not change the coding session or let an old capture restore it.
4. To connect another conversation, move the buddy over the open session, click the buddy, then **Connect**. Dragging only moves it. Cursor and terminal Claude Code can use the separate connection prompt.
5. Continue working in a connected session. Keep the buddy running. New turns are captured automatically; Gallery and Story update in the background. Long imports can take several batches. An error keeps the last good view and offers Retry.
6. Right-click the buddy to hide it. The menu-bar icon brings it back. Hiding keeps sync running; quitting stops it.

## Verified

- 206 unit tests, lint, TypeScript and the production build.
- Local capture, replay protection, source filtering, manual additions, upload/download, deletion, Undo and disconnect behavior.
- Real GPT-6 Luna generation and continuation, including retaining earlier decisions and keeping deleted media deleted.
- Hosted authentication, isolation, setup, generation, continuation, private uploads, downloads, byte ranges and deletion.
- One-prompt setup with disposable Codex, Claude Code and Cursor transcripts. Setup does not collect the setup conversation.
- Desktop and mobile map/Story views, zoom detail, keyboard access, node dragging and the hidden grid.
- Native buddy drags from off-center grab points, exact final coordinates, fixed face position when Connect appears, Hide and native restore.
- GitHub pushes trigger Vercel production builds. Database migrations preserve the legacy stories; backups were taken before migration.

## Current limits

- Session images pasted into coding agents are not automatically imported yet. Add those images manually. The model receives session text and media metadata, not image pixels.
- Automatic screenshots of generated local websites are not wired into the Story canvases. Public webpage captures are local; hosted cards use available covers. Sites that block previews can remain text cards.
- Stories keep up to five significant steps, carrying forward prior context. Very long histories are condensed rather than appended without limit.
- The buddy uses undocumented local session formats. A fresh Mac install and every native Cursor/Claude window arrangement still need real-world testing. The companion is not notarized.
- The website's Show buddy link was not verified through the browser automation, which blocks external app links. Native restore was verified.
- The hosted prototype is one access-code-protected owner space, not separate user accounts.
