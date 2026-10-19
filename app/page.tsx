import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Workspace from "@/components/workspace";
import { SharedCollection } from "@/components/shared-collection";
import { getChatGPTUser } from "./chatgpt-auth";
import { getDb } from "@/db";
import { collections } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "@/lib/runtime-env";
import { createSharedCollectionStore } from "@/lib/shared-collection.mjs";
import type { Collection, Item } from "@/lib/types";
type Params = {
  demo?: string;
  collection?: string;
  view?: string;
  dev?: string;
};
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Params>;
}): Promise<Metadata> {
  const params = await searchParams;
  return params.collection ? { robots: { index: false, follow: false } } : {};
}
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const demo = params.demo === "1";
  if (!demo && params.collection && params.collection !== "all") {
    const [collection] = await getDb()
      .select({ ownerId: collections.ownerId })
      .from(collections)
      .where(
        and(
          eq(collections.id, params.collection),
          isNull(collections.deletedAt),
        ),
      );
    if (!collection) notFound();
    const user = await getChatGPTUser();
    if (user?.userId !== collection.ownerId) {
      const data = await createSharedCollectionStore(env.DB).get(
        params.collection,
      );
      if (!data) notFound();
      const dev = params.dev === "1";
      const view =
        params.view === "story"
          ? "story"
          : params.view === "gallery" && dev
            ? "gallery"
            : "map";
      return (
        <SharedCollection
          key={params.collection}
          initial={data as { collection: Collection; items: Item[] }}
          initialView={view}
          initialDev={dev}
        />
      );
    }
  }
  return <Workspace key={demo ? "demo" : "personal"} initialDemo={demo} />;
}
