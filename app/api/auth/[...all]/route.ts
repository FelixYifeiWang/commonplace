import { accountsEnabled, getAuth } from "@/lib/auth";
export const runtime = "nodejs";
async function handler(request: Request) {
  if (!accountsEnabled())
    return Response.json(
      { error: "Google sign-in is not configured." },
      { status: 503 },
    );
  return getAuth().handler(request);
}
export { handler as GET, handler as POST };
