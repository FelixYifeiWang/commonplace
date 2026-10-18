export function setupInstructions(origin) {
  return `# Set up Commonplace

Install the desktop buddy and subscribe ONLY the conversation where the user pasted their private setup link. This is a local macOS 13+ setup, not a cloud-agent integration. No MCP, Accessibility, screen recording, global npm package, or coding-agent settings are needed.

1. Keep the full /setup#… link from the user's message private. Do not echo it, commit it, put it in a URL query, or send it to another service. Its fragment is a single-use pairing code that expires after 30 minutes. Fetch this page without the fragment.
2. Check that this agent's shell runs on the user's Mac and has Node.js 22.13+ and npm. If this is a remote/container session, explain that setup must run in a local agent. Do not claim a remote install creates a buddy on their laptop. If Node is missing, help install it from the official Node distribution, respecting any OS confirmation.
3. Download ${origin}/companion/install.mjs to a temporary directory. Read it before running. It downloads a small, explicit client bundle with SHA-256 checks and the official Electron runtime via npm. No access to our private GitHub repo is needed.
4. Run the downloaded installer with JSON on stdin, using the EXACT private link from the user:

    node /absolute/path/to/install.mjs <<'COMMONPLACE_SETUP'
    {"link":"<the user's exact private setup link>","title":"<brief title of this conversation>"}
    COMMONPLACE_SETUP

The installer searches recent local JSONL transcript tails for this unique link in a USER message, then follows only that exact file. It supports Codex, Claude Code and Cursor local transcripts. It never chooses the newest conversation. If automatic matching fails and this agent knows this conversation's exact transcript path, add "transcriptPath":"<absolute path>" to the JSON. The same unique link must still occur in a user message. Never guess a different session. If the prompt has not been written to disk, let the turn finish and retry once; if transcripts are disabled, explain that they must be enabled first. Old Cursor text-only logs and cloud-only chats are not supported.

The installer uses ~/Library/Application Support/Commonplace/<space-id> and a per-user LaunchAgent. It starts the buddy now and at login; updates sync every 15 seconds while the Mac and buddy are running. Subsequent setup prompts reuse the installation and paired device. No unrelated conversations are subscribed. Existing user hooks, skills, MCP settings and repositories are untouched. Device credentials are encrypted by Electron safeStorage; the short-lived setup request is deleted after consumption.

5. Wait for “Buddy connected.” A download, process launch, pending receipt, or failed network request is NOT success. Report a blocked permission or unavailable transcript plainly. Never disable Gatekeeper or bypass an OS/security confirmation. On success, say only “Connected. Your session will keep updating in Commonplace.”

The app's Connections settings can revoke this computer. To stop automatic launch, run the generated uninstall.mjs in the installation's space folder; it stops the buddy without deleting saved collections. The user's OpenAI API key stays on the server and must never be requested or copied to the laptop.
`;
}
