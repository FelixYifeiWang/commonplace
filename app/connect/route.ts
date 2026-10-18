import { setupInstructions } from "@/lib/setup-instructions.mjs";
export async function GET(request: Request) {
  return new Response(
    setupInstructions(new URL(request.url).origin, "connect"),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
