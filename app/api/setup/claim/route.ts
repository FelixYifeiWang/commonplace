import { env } from "@/lib/runtime-env";
import { createPairingStore } from "@/lib/pairing-store.mjs";
import { jsonBody, fail, newToken, hash, HttpError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const body = await jsonBody(request);
    if (typeof body.code !== "string" || !/^[a-f0-9]{64}$/.test(body.code))
      throw new HttpError(400, "Copy a fresh setup prompt from your space.");
    const database = env.DB;
    if (!database) throw new HttpError(503, "Setup is unavailable.");
    const codeHash = await hash(body.code);
    const existing =
      typeof body.deviceToken === "string" &&
      /^[a-f0-9]{64}$/.test(body.deviceToken)
        ? await database
            .prepare(
              "SELECT d.id FROM devices d JOIN pairing_codes p ON p.owner_id=d.owner_id WHERE p.code_hash=? AND d.token_hash=? AND d.revoked=0",
            )
            .bind(codeHash, await hash(body.deviceToken))
            .first<{ id: string }>()
        : null;
    const id = existing?.id || crypto.randomUUID(),
      token = existing ? body.deviceToken : newToken();
    const claimed = await createPairingStore(database).claim({
      codeHash,
      deviceId: id,
      tokenHash: await hash(token),
      name: "Desktop buddy",
    });
    if (!claimed)
      throw new HttpError(
        410,
        "Setup link expired or already used. Copy a fresh prompt.",
      );
    return Response.json(
      { id, token },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
