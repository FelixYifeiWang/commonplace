import { env } from "@/lib/runtime-env";
import { createPairingStore } from "@/lib/pairing-store.mjs";
import { deviceRequired, jsonBody, fail, hash, HttpError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const device = await deviceRequired(request);
    const body = await jsonBody(request);
    if (typeof body.code !== "string" || !/^[a-f0-9]{64}$/.test(body.code))
      throw new HttpError(400, "Invalid setup request.");
    if (
      !(await createPairingStore(env.DB).ready(
        await hash(body.code),
        device.id,
      ))
    )
      throw new HttpError(410, "Setup expired. Copy a fresh prompt.");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
