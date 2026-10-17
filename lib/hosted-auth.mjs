import { createHmac, timingSafeEqual } from "node:crypto";
export const SESSION_COOKIE = "commonplace_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 30;
export function equalSecret(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !b) return false;
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
export function createSession(secret, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "hosted-owner",
      exp: Math.floor(now / 1000) + SESSION_SECONDS,
    }),
  ).toString("base64url");
  return (
    payload +
    "." +
    createHmac("sha256", secret).update(payload).digest("base64url")
  );
}
export function verifySession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  if (
    !equalSecret(
      signature,
      createHmac("sha256", secret).update(payload).digest("base64url"),
    )
  )
    return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString());
    return value.sub === "hosted-owner" &&
      Number.isFinite(value.exp) &&
      value.exp > now / 1000
      ? value.sub
      : null;
  } catch {
    return null;
  }
}
