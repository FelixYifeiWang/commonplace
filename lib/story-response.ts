import { scheduleStoryWork } from "@/lib/runtime-story";
export function storyResponse(body: unknown, init?: ResponseInit) {
  scheduleStoryWork();
  return Response.json(body, init);
}
