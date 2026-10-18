import { publicUrl } from "./media.mjs";
// Utility screens are navigation, not research references. Match whole path segments,
// so articles such as /blog/authentication-design remain collectible.
export function isReferenceUrl(value) {
  const safe = publicUrl(value);
  if (!safe) return false;
  const url = new URL(safe),
    host = url.hostname.toLowerCase();
  if (
    /^(auth|accounts?|login|signin|sso|oauth|identity)\./.test(host) ||
    host.endsWith(".auth0.com")
  )
    return false;
  const path = url.pathname.toLowerCase();
  if (/^\/r\/[a-f0-9]{48}\.md$/.test(path)) return false;
  // Whole hosts only for personal inboxes. Product pages and public shares remain sources.
  if (
    [
      "mail.google.com",
      "outlook.live.com",
      "outlook.office.com",
      "outlook.office365.com",
    ].includes(host)
  )
    return false;
  if (
    ["chatgpt.com", "chat.openai.com"].includes(host) &&
    /(^|\/)(c|conversation|conversations|tasks?|settings)(\/|$)/.test(path)
  )
    return false;
  if (
    host === "claude.ai" &&
    /^\/(chat|project|settings|recents|design|code)(\/|$)/.test(path)
  )
    return false;
  if (
    ["cursor.com", "www.cursor.com"].includes(host) &&
    /^\/(dashboard|settings|chat)(\/|$)/.test(path)
  )
    return false;
  if (url.searchParams.has("code") && url.searchParams.has("state"))
    return false;
  // Explicit documentation/article prefixes can discuss login without being login screens.
  if (/^\/(blog|docs|documentation|articles|guides)\//.test(path)) return true;
  return !/(^|\/)(auth|authentication|consent|verify-email|log-?in|sign-?in|sign-?out|log-?out|oauth2?|authorize|callback|signin-oidc)(\/|$)/i.test(
    url.pathname,
  );
}

// Ambient app state describes where the browser happens to be, not what was saved.
export function referenceText(value) {
  return String(value || "").replace(
    /<(in-app-browser-context|external_codex_apps_open_page|recommended_plugins)\b[^>]*>[\s\S]*?<\/\1>/gi,
    "",
  );
}
export function isReferenceItem(item) {
  if (!item.url) return true;
  if (!isReferenceUrl(item.url)) return false;
  const source = item.sourceText || "";
  const clean = referenceText(source);
  return (
    clean === source || !source.includes(item.url) || clean.includes(item.url)
  );
}
