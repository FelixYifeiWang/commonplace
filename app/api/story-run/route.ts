import { env } from "@/lib/runtime-env";
import { createCollectionTrash } from "@/lib/collection-trash.mjs";
import { scheduleStoryWork } from "@/lib/runtime-story";
import { equalSecret } from "@/lib/hosted-auth.mjs";
export const maxDuration = 300;
export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    !equalSecret(
      request.headers.get("authorization"),
      "Bearer " + process.env.CRON_SECRET,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  await createCollectionTrash(env.DB).purge();
  scheduleStoryWork();
  return Response.json({ ok: true });
}
