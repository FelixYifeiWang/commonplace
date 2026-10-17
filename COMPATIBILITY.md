# Permission-free session connections

Checked locally on 17 October 2026. These findings do not imply that all adapters are implemented.

| App | Local evidence | Current boundary |
| --- | --- | --- |
| Codex desktop | Process-specific navigation log events contain the active conversation ID. The session database maps it to a local JSONL transcript. | Implemented in the preview; open conversation, single window. Actual drop onto a conversation still needs user validation. |
| Claude Code in Claude desktop | `LocalSessions.setFocusedSession` log events identify a desktop session. Session metadata maps `sessionId` to `cliSessionId`; a sampled exact match resolved to its JSONL transcript. | Feasible adapter. A `null` focus event must clear selection; cannot choose the last non-null record. Need live navigation and focus-loss validation before enabling drops. |
| Claude Code in a terminal | Live process metadata contains `pid`, `sessionId`, and working directory. Transcripts are local JSONL. | Process ancestry can narrow the terminal app, but does not identify its selected tab or split. A session-specific integration is needed when several sessions share a terminal. |
| Cursor | Workspace SQLite state contains `selectedComposerIds` and `lastFocusedComposerIds`. The global database contains `composerData` and `bubbleId` records. | Feasible adapter. Cursor was not running here; persistence timing, current window-to-workspace mapping, and multiple selected chats remain unverified. Never choose a workspace by newest file timestamp. |

The drop detector uses window geometry and the owner process, without Accessibility, screenshots, or protected window titles. The target app must expose enough local state to identify a specific open session. All adapters should fail without capture when this cannot be established.

Following an identified session is a separate problem from identifying the drop target. A local watcher can forward new turns for the explicitly subscribed ID. Both [Claude Code hooks](https://code.claude.com/docs/en/hooks) and [Cursor hooks](https://cursor.com/docs/hooks) expose session identifiers and transcript paths as potential event-based alternatives. Hooks alone do not identify the tab under a drop; installing them is additional setup and is not part of the current preview.

No Claude or Cursor configuration was changed, and no conversation was subscribed or uploaded during this investigation. Read-only local schema checks inspected field names and ID joins. These local formats are undocumented and version-dependent.
