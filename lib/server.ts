import { captureUnavailable } from "./capture-transaction.mjs";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getDb } from "@/db";
import { sessions, devices } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}
export async function userRequired() {
  const user = await getChatGPTUser();
  if (!user) throw new HttpError(401, "Sign in to open your space.");
  return user;
}
export async function jsonBody(request: Request) {
  const raw = await request.text();
  if (raw.length > 1_000_000)
    throw new HttpError(413, "This batch is too large. Send fewer items.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Send valid JSON.");
  }
}
export function fail(error: unknown) {
  if (captureUnavailable(error))
    return Response.json(
      {
        error:
          "Sync stopped. Keep your cursor unchanged and retry when resumed.",
      },
      { status: 409 },
    );
  if (error instanceof HttpError)
    return Response.json(
      { error: error.message, ...(error.code ? { code: error.code } : {}) },
      { status: error.status },
    );
  console.error("Newron request failed", error);
  return Response.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 },
  );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    throw new HttpError(403, "This request must come from your space.");
}
export async function hash(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export function newToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function deviceRequired(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "A device connection key is required.");
  const [device] = await getDb()
    .select()
    .from(devices)
    .where(
      and(eq(devices.tokenHash, await hash(token)), eq(devices.revoked, false)),
    );
  if (!device)
    throw new HttpError(401, "Device connection not found or revoked.");
  return device;
}
export async function agentSession(request: Request, subscriptionId?: string) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "A valid session connection key is required.");
  const db = getDb();
  let [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, await hash(token)));
  if (!session && subscriptionId) {
    const device = await deviceRequired(request);
    [session] = await db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.id, subscriptionId),
          eq(sessions.ownerId, device.ownerId),
          eq(sessions.deviceId, device.id),
        ),
      );
  }
  if (!session || session.state === "revoked")
    throw new HttpError(
      401,
      "This connection is no longer available.",
      "SESSION_UNAVAILABLE",
    );
  if (session.state === "paused")
    throw new HttpError(
      409,
      "This session is paused. Keep your cursor unchanged and retry when resumed.",
    );
  return session;
}
