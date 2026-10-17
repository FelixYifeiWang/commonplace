import { getDb } from "@/db";
import { collections } from "@/db/schema";
import {
  userRequired,
  jsonBody,
  fail,
  checkOrigin,
  HttpError,
} from "@/lib/server";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await userRequired(),
      body = await jsonBody(request);
    if (
      typeof body.name !== "string" ||
      !body.name.trim() ||
      body.name.length > 100
    )
      throw new HttpError(
        400,
        "Give your collection a name, up to 100 characters.",
      );
    const collection = {
      id: crypto.randomUUID(),
      ownerId: user.userId,
      name: body.name.trim(),
      description:
        typeof body.description === "string"
          ? body.description.slice(0, 500)
          : "",
      createdAt: new Date().toISOString(),
    };
    await getDb().insert(collections).values(collection);
    return Response.json(collection, { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
