export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return new Response(
    `# Newron: optional agent connection

The user's URL fragment (#) is a device API token. Keep it out of chat replies, logs, and repositories. Do not install MCP or request database credentials.

Use Authorization: Bearer <token> and Content-Type: application/json for both requests below.

1. Connect THIS session only: POST ${origin}/api/subscribe
{"sessionId":"<stable conversation id>","title":"<short title>","provider":"Codex","mode":"once"}
Providers: Codex, Claude Code, Cursor, Other. Save the returned subscriptionId. If restored:true, briefly tell the user "Collection restored." Do not read unrelated conversations or credential files.

2. Digest the history available in this conversation. Send useful references, ideas, quotes, and notes to POST ${origin}/api/ingest:
{"subscriptionId":"<returned id>","sessionId":"<same stable conversation id>","state":"collecting","items":[{"kind":"idea","title":"<idea title>","body":"<explanation>","externalId":"<stable item id>","sourceText":"<verbatim supporting passage>","sourceRole":"user","sourceTurn":"<turn id>","inferred":false}]}

Kinds: link, image, video, idea, quote, note. Links and media need a valid HTTP(S) url. An image can also have imageUrl. Every item needs title and sourceText. Send at most 100 items per request. A repeated URL or externalId updates the existing item. Mark your own interpretations inferred:true. Preserve rejected or speculative context. Do not invent citations, links, or inaccessible content.

3. Finish with the same payload, an empty items array, and state complete. Report any history you could not access. This is a one-time digest. Ongoing subscriptions are managed by the desktop companion; do not claim to keep monitoring after this turn.

Optional future contributions can use the same device token to create another subscription. Store a persistent token only in a user-approved local configuration file with mode 0600 outside repositories. The token is write-only and can be revoked in Settings. Session subscriptions can be paused independently.

Private hosted previews require the hosting platform's authentication as well as this key. Use an authenticated browser or a separately provisioned service connection. If redirected to sign-in, report the access requirement rather than claiming success. Never treat sign-in HTML as an API response.
`,
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
