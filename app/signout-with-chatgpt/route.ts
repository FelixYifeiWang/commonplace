import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/hosted-auth.mjs";
export async function GET() {
  (await cookies()).delete(SESSION_COOKIE);
  return new Response(null, { status: 303, headers: { Location: "/" } });
}
