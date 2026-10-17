import Workspace from "@/components/workspace";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const params = await searchParams;
  const demo = params.demo === "1";
  return <Workspace key={demo ? "demo" : "personal"} initialDemo={demo} />;
}
