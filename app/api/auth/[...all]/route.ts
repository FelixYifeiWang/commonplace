import { accountsEnabled, authOrigin, getAuth } from "@/lib/auth";
import { signInOriginRedirect } from "@/lib/auth-origin.mjs";
import { checkOrigin, fail } from "@/lib/server";
export const runtime = "nodejs";
async function handler(request: Request) {
  if (!accountsEnabled())
    return Response.json(
      { error: "Google sign-in is not configured." },
      { status: 503 },
    );
  try {
    if (request.method === "POST") checkOrigin(request);
    if (
      request.method === "POST" &&
      new URL(request.url).pathname === "/api/auth/sign-in/social"
    ) {
      const destination = signInOriginRedirect(request.url, authOrigin());
      // Older open tabs still call this endpoint. Use the auth client's normal
      // redirect response before it can create a cookie on the wrong domain.
      if (destination)
        return Response.json({ url: destination, redirect: true });
    }
    return await getAuth().handler(request);
  } catch (error) {
    return fail(error);
  }
}
export { handler as GET, handler as POST };
