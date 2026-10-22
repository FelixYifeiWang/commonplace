import { env } from "@/lib/runtime-env";
import {
  sanitizeSetupReport,
  storeSetupReport,
} from "@/lib/setup-diagnostics.mjs";
import { hash, HttpError, fail } from "@/lib/server";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 24000) throw new HttpError(413, "Report too large.");
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Send valid JSON.");
    }
    if (
      !body ||
      typeof body.code !== "string" ||
      !/^[a-f0-9]{64}$/.test(body.code)
    )
      throw new HttpError(400, "Invalid setup request.");
    let report;
    try {
      report = sanitizeSetupReport(body.report);
    } catch {
      throw new HttpError(400, "Invalid setup report.");
    }
    if (!(await storeSetupReport(env.DB, await hash(body.code), report)))
      throw new HttpError(410, "Setup expired. Copy a fresh prompt.");
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return fail(error);
  }
}
