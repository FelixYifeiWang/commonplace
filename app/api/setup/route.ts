import { env } from "@/lib/runtime-env";
import { createPairingStore } from "@/lib/pairing-store.mjs";
import { userRequired, checkOrigin, fail, newToken, hash } from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      code = newToken();
    const expiresAt = await createPairingStore(env.DB).issue(
      await hash(code),
      user.userId,
    );
    return Response.json(
      { link: new URL("/setup", request.url).href + "#" + code, expiresAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
