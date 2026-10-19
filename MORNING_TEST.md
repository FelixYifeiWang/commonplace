# Hosted test guide

Open [Newron](https://newron.app). Use Vercel for testing unless local testing is explicitly requested.

1. Sign in with Google. A new account starts with an empty space. If you previously used the access code in this browser, choose **Open existing space** to retain its collections and Nox connections.
2. **All collections** opens the overview. Hover a collection to delete it. **Undo** restores it but leaves capture disconnected.
3. Open a collection. **Map** connects sources and **Story** explains decisions. Map is the default. Dev mode (**Cmd/Ctrl+Shift+G**) adds **Gallery**, which shows saved media. All views use the same collection.
4. Use **Set up Nox** from the hosted app. The setup prompt installs and pairs without collecting the setup conversation. Open a meaningful conversation, move Nox over it, click it, then choose **Connect**.
5. Keep Nox running. New turns appear automatically. Map and Story update in the background. An error preserves the last good view and offers Retry.

Local and hosted spaces are separate. Existing local connections are not moved automatically.

## Current limits

- Native click-to-connect supports an open Codex conversation and Claude Code in the Claude desktop app. Cursor uses the explicit connection prompt. See [compatibility](COMPATIBILITY.md).
- Screenshots and images pasted into coding sessions are not automatically imported yet. Add them manually.
- Hosted website cards use metadata covers; browser screenshots are a local-preview feature.
- Nox uses undocumented local session formats and is not notarized.
- Map and Story use GPT-6 Luna and consume API credits.
