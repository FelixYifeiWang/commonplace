import { setupInstructions } from "@/lib/setup-instructions.mjs";
export async function GET(request: Request) {
  return new Response(setupInstructions(new URL(request.url).origin), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
