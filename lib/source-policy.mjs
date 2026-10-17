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
  return !/(^|\/)(log-?in|sign-?in|sign-?out|log-?out|oauth2?|authorize|callback|signin-oidc)(\/|$)/i.test(
    url.pathname,
  );
}
