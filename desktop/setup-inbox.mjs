import { readFile, writeFile, rename, unlink, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { validateSessionSource } from "./setup-session.mjs";
export async function consumeSetupRequest(
  data,
  {
    origin,
    connection,
    pair,
    subscribe,
    capture,
    report,
    request = fetch,
    validate = validateSessionSource,
  },
) {
  const file = join(data, "setup-request.json");
  let input;
  try {
    const text = await readFile(file, "utf8");
    if (text.length > 16384) throw new Error("Setup request too large.");
    input = JSON.parse(text);
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
  if (!/^[a-f0-9-]{36}$/.test(input.id))
    throw new Error("Invalid setup receipt.");
  const receipt = join(data, "receipts", input.id + ".json");
  let result;
  try {
    if (input.origin !== origin || !/^[a-f0-9]{64}$/.test(input.code))
      throw new Error("Setup request does not match this space.");
    if (input.action && !["setup", "connect"].includes(input.action))
      throw new Error("Invalid setup action.");
    const source =
      input.action === "connect" ? await validate(input.source) : null;
    if (source)
      report({ state: "connecting", target: source.title, error: "" });
    const response = await request(origin + "/api/setup/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      redirect: "error",
      body: JSON.stringify({
        code: input.code,
        deviceToken: connection?.token,
      }),
    });
    if (!response.headers.get("content-type")?.includes("application/json"))
      throw new Error("The setup service requires sign-in.");
    const device = await response.json();
    if (!response.ok)
      throw new Error(device.error || "Setup failed. Copy a fresh prompt.");
    await pair({ origin, ...device });
    if (!source) {
      result = { ok: true, action: "setup" };
    } else {
      const subscription = await subscribe(source);
      report({ state: "collecting", target: source.title, error: "" });
      await capture(source, subscription);
      report({ state: "following", target: source.title, error: "" });
      result = {
        ok: true,
        provider: source.provider,
        sessionId: source.sessionId,
      };
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : "Setup failed.";
    report({ state: "error", error });
    result = { ok: false, error };
  }
  await mkdir(join(data, "receipts"), { recursive: true, mode: 0o700 });
  await writeFile(receipt + ".tmp", JSON.stringify(result), { mode: 0o600 });
  await rename(receipt + ".tmp", receipt);
  await unlink(file);
  return result;
}
