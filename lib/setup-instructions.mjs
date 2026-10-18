export function setupInstructions(origin, action = "setup") {
  const connect = action === "connect";
  return `# ${connect ? "Connect a session" : "Set up Nox"}

${connect ? "Connect only the conversation where the user pasted this connection prompt." : "Install, pair and launch Nox. Do not read, import or subscribe to this conversation. Do not create a collection."}

Keep user messages brief. Use plain language and no em dash. Do the work without narrating each command. Do not recommend projects, explain what was not collected, or repeat setup details. Keep the full instructions here, not in the user-facing reply.

1. Run locally on macOS 13+ with Node.js 22.13+ and npm. A cloud agent cannot install Nox on your Mac. If Node is missing, use its official distribution and respect OS approval.
2. Keep the private link secret. Its code is single-use and expires after 30 minutes. Fetch this Markdown file without the URL fragment. Never print the code or send it elsewhere.
3. Download ${origin}/companion/install.mjs to a temporary directory and read it. Run it with the user's exact link as JSON on stdin:

    node /absolute/path/to/install.mjs <<'COMMONPLACE_SETUP'
    {"link":"<private link from the user>"}
    COMMONPLACE_SETUP

${connect ? "The installer matches this /connect link in a local user message and follows only that transcript. Codex, Claude Code and Cursor JSONL are supported. If needed, supply this conversation's exact transcriptPath and a brief title. Never guess a session. Cloud chats and disabled transcripts are unsupported." : "Setup does not need a transcript path or conversation title. Never substitute a /connect link. Leave the space empty so the user can choose a meaningful session later."}

The installer verifies client files, installs the official Electron runtime, checks it before launch, and starts Nox now and at login. It reuses an existing installation and encrypts the device key. It does not change MCP, hooks or agent settings. The OpenAI key stays on the server.

If installation fails, stop and state the error briefly. Do not report success, start a broken runtime, change permissions, bypass macOS protections or recommend broad App Management access as a routine step. Do not retry a denied operation through another tool or location.

Wait for “${connect ? "Session connected." : "Nox ready."}” before reporting success. Use the exact success reply below, with no introduction, extra advice or follow-up question:

${connect ? "Connected. This collection will update as you work." : 'If running in Codex, reply: "Nox ready. Open a Codex session, move Nox over it, click it, then Connect."\n\nOtherwise, reply: "Nox ready. In Newron, open Settings, then Connections. Choose Connect a session and paste its prompt into the conversation you want to save."'}

To reopen Nox, use Open Nox on the website or Nox in Applications. Hiding Nox keeps syncing; quitting stops it. Settings → Connections can revoke this computer. The generated uninstall.mjs stops automatic launch and keeps saved collections.
`;
}
