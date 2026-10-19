import { env } from "@/lib/hosted/runtime-env";
import { queueUpload } from "@/lib/upload-lease.mjs";
import {
  handleUploadPresigned,
  type HandleUploadPresignedBody,
} from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { userRequired, checkOrigin, fail, HttpError } from "@/lib/server";
export async function POST(request: Request) {
  try {
    if (process.env.COMMONPLACE_HOSTED !== "1")
      throw new HttpError(404, "Not available.");
    const body = (await request.json()) as HandleUploadPresignedBody;
    const result = await handleUploadPresigned({
      request,
      body,
      async getSignedToken(pathname, _payload, multipart) {
        checkOrigin(request);
        const user = await userRequired();
        const prefix = `users/${encodeURIComponent(user.userId)}/`;
        if (
          !pathname.startsWith(prefix) ||
          !/^users\/[^/]+\/[0-9a-f-]{36}\/[^/]+$/.test(pathname)
        )
          throw new HttpError(403, "File unavailable.");
        await queueUpload(env.DB, user.userId, pathname);
        return {
          token: await issueSignedToken({
            pathname,
            operations: ["put"],
            maximumSizeInBytes: 250 * 1024 * 1024,
            validUntil: Date.now() + 600000,
          }),
          urlOptions: {
            access: "private",
            multipart,
            addRandomSuffix: false,
            allowOverwrite: false,
          },
        };
      },
      async onUploadCompleted() {},
    });
    return Response.json(result);
  } catch (error) {
    return fail(error);
  }
}
