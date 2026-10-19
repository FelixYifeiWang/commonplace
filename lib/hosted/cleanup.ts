import { del } from "@vercel/blob";
import { env } from "./runtime-env";
import { createBlobCleanup } from "../blob-cleanup.mjs";
export async function cleanupFiles() {
  return createBlobCleanup(env.DB, {
    remove: (key: string) => del(key),
  }).drain();
}
