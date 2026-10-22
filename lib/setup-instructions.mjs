export function setupInstructions(origin, action = "setup") {
  const connect = action === "connect";
  return `# ${connect ? "Connect a session" : "Set up Nox"}

${connect ? "Connect only the conversation where the user pasted this connection prompt." : "Install, pair and launch Nox. Do not read, import or subscribe to this conversation. Do not create a collection."}

Keep user messages brief. Use plain language and no em dash. Before starting, say exactly: "Setting up Nox. Wait for Nox ready before connecting a session." Then do the work without narrating each command. Do not recommend projects, explain what was not collected, or repeat setup details. Keep the full instructions here, not in the user-facing reply.

1. Confirm the terminal runs on the user's Mac, not a remote sandbox. Check the execution environment before downloading anything. Nox needs macOS 13+, Node.js 22.13+ and npm. A desktop chat window alone does not mean its terminal is local. If this is a cloud agent or no local terminal is available, stop: "Open Codex, Claude Code or Cursor on your Mac and paste the setup prompt there." If Node is missing, use its official distribution and respect OS approval.
2. Keep the private link secret. Its code is single-use and expires after 30 minutes. Fetch this Markdown file without the URL fragment. Never print the code or send it elsewhere.
3. Before installation, use the agent's normal permission request for network access and write access to the installer destinations, if required by its sandbox: ~/Library/Application Support/Commonplace (Nox data and runtime), ~/Library/LaunchAgents (start at login), and ~/Applications (Nox shortcut). Request only the access needed by the installer. Do not ask for the entire Library folder, Full Disk Access, Accessibility or routine App Management access. Setup alone does not need any session history. If approval is pending, say: "Approve the setup permission request in your agent to continue." Wait for approval. If denied or unavailable, stop and identify the missing access briefly. Never substitute a cloud terminal or another location to evade a restriction.
4. Download ${origin}/companion/install.mjs to a temporary directory and read it. Run it with the user's exact link as JSON on stdin:

    node /absolute/path/to/install.mjs <<'COMMONPLACE_SETUP'
    {"link":"<private link from the user>"}
    COMMONPLACE_SETUP

${connect ? "The installer matches this /connect link in a local user message and follows only that transcript. Codex, Claude Code and Cursor JSONL are supported. If needed, supply this conversation's exact transcriptPath and a brief title. Never guess a session. Cloud chats and disabled transcripts are unsupported." : "Setup does not need a transcript path or conversation title. Never substitute a /connect link. Leave the space empty so the user can choose a meaningful session later."}

The installer verifies client files, installs the official Electron runtime, checks it before launch, and starts Nox now and at login. It reuses an existing installation and encrypts the device key. It does not change MCP, hooks or agent settings. The OpenAI key stays on the server.

If the download cannot resolve the host, check whether this terminal has network access. Do not assume the website is down or that Nox is installed. Say: "This agent could not reach Newron. Check its network access, then retry setup." Do not change DNS, use another host, disable TLS checks or move to another execution environment to bypass a network restriction. If the link expires while resolving access, ask the user to copy a fresh setup prompt from Newron.

If installation fails, stop and state the error briefly. Do not report success, start a broken runtime, change permissions, bypass macOS protections or recommend broad App Management access as a routine step. Do not retry a denied operation through another tool or location.

Wait for “${connect ? "Session connected." : "Nox ready."}” before reporting success. Use the exact success reply below, with no introduction, extra advice or follow-up question:

${connect ? "Connected. This collection will update as you work." : 'If running in Codex, reply: "Nox ready. Open a Codex session, move Nox over it, click it, then Connect."\n\nOtherwise, reply: "Nox ready. In Newron, open Settings, then Connections. Choose Connect a session and paste its prompt into the conversation you want to save."'}

To reopen Nox, use Open Nox on the website or Nox in Applications. Hiding Nox keeps syncing; quitting stops it. Manage saved sessions in Settings → Connections. The generated uninstall.mjs stops automatic launch and keeps saved collections.
`;
}
