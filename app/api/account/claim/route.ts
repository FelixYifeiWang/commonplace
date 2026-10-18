import { cookies } from "next/headers";
import { accountIdentity } from "@/lib/account-auth";
import { createAccountSpaces } from "@/lib/account-spaces.mjs";
import { SESSION_COOKIE, verifySession } from "@/lib/hosted-auth.mjs";
import { env } from "@/lib/runtime-env";
import { checkOrigin, fail, HttpError } from "@/lib/server";
async function context() {
  const id = await accountIdentity();
  if (!id) throw new HttpError(401, "Sign in to continue.");
  const jar = await cookies();
  const proof =
    verifySession(
      jar.get(SESSION_COOKIE)?.value,
      process.env.COMMONPLACE_SESSION_SECRET,
    ) === "hosted-owner";
  return { id, proof, jar, spaces: createAccountSpaces(env.DB) };
}
export async function GET() {
  try {
    const { id, proof, spaces } = await context();
    return Response.json(
      { canClaim: await spaces.canClaim(id, proof) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return fail(e);
  }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const { id, proof, jar, spaces } = await context();
    if (!proof)
      throw new HttpError(
        403,
        "Open this from the browser that holds your existing space.",
      );
    if (!(await spaces.claim(id, proof)))
      throw new HttpError(
        409,
        "This account already has a space, or the existing space is linked.",
      );
    jar.delete(SESSION_COOKIE);
    return Response.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
