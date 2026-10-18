import { env } from "@/lib/runtime-env";
import { createPairingStore } from "@/lib/pairing-store.mjs";
import {
  userRequired,
  checkOrigin,
  fail,
  newToken,
  hash,
  HttpError,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      code = newToken();
    const setupId = await hash(code);
    const expiresAt = await createPairingStore(env.DB).issue(
      setupId,
      user.userId,
    );
    return Response.json(
      {
        link: new URL("/setup.md", request.url).href + "#" + code,
        expiresAt,
        setupId,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}

export async function GET(request: Request) {
  try {
    const user = await userRequired();
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new HttpError(400, "Invalid setup request.");
    const status = await createPairingStore(env.DB).status(id, user.userId);
    if (!status) throw new HttpError(404, "Copy a fresh setup prompt.");
    return Response.json(
      { status },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
