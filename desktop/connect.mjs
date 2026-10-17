// Only the explicit Connect action may subscribe; resolving the candidate is read-only.
export async function connectSession({
  inspect,
  resolve,
  subscribe,
  capture,
  report,
  point,
}) {
  try {
    const target = await inspect(point);
    if (target.error || target.bundleId !== "com.openai.codex")
      throw new Error("Place the buddy over an open Codex conversation.");
    const source = await resolve(target);
    report({ state: "connecting", target: source.title, error: "", point });
    const subscription = await subscribe(source);
    report({ state: "collecting", target: source.title });
    await capture(source, subscription);
    report({ state: "following", target: source.title, error: "" });
    return { connected: true, source };
  } catch (error) {
    report({ state: "error", error: error.message });
    return { connected: false };
  }
}
