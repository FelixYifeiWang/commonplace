import { accountsEnabled, getAuth } from "@/lib/auth";
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
    return await getAuth().handler(request);
  } catch (error) {
    return fail(error);
  }
}
export { handler as GET, handler as POST };
