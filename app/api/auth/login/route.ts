import { cookies } from "next/headers";
import {
  createSession,
  equalSecret,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/hosted-auth.mjs";
import { checkOrigin, fail, HttpError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (process.env.COMMONPLACE_HOSTED !== "1")
      throw new HttpError(404, "Not available.");
    if (Number(request.headers.get("content-length") || 0) > 4096)
      throw new HttpError(413, "Code too long.");
    const form = await request.formData();
    if (!equalSecret(form.get("code"), process.env.COMMONPLACE_ACCESS_CODE))
      return new Response(null, {
        status: 303,
        headers: { Location: "/signin-with-chatgpt?error=1" },
      });
    const secret = process.env.COMMONPLACE_SESSION_SECRET;
    if (!secret) throw new HttpError(503, "Sign-in is not configured.");
    (await cookies()).set(SESSION_COOKIE, createSession(secret), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return new Response(null, { status: 303, headers: { Location: "/" } });
  } catch (error) {
    return fail(error);
  }
}
