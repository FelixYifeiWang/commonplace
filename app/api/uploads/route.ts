import { userRequired, checkOrigin, fail } from "@/lib/server";
import preview from "@/lib/runtime-preview";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired();
    return Response.json(await preview.ticket(user.userId));
  } catch (e) {
    return fail(e);
  }
}
