import newron from "@/examples/newron-story.json";
// For the demo video only, not a product feature: these coding sessions always show a hand-curated Story and Map.
// Whenever Nox connects one (a new collection, a resume, or a reconnect after its collection was deleted), the
// curated document is saved again, so the recording always shows exactly the mockup. Keyed by the session id Nox
// sends, which for Claude Code is the transcript's file name.
export const DEMO_SESSIONS: Record<string, unknown> = {
  // The main Newron chat (Claude Code), shown as the Story mockup https://claude.ai/artifact/3MzQCog5YGby3hiHz1VEV8
  "763053fe-8e3a-425b-b9ae-a50496d0d64c": newron,
};
