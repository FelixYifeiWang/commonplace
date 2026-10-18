// Commonplace's agent installer. No global packages, MCP, or agent settings are modified.
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  rm,
} from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
const exec = promisify(execFile);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const escapeXml = (s) =>
  String(s).replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function parseSetupLink(link) {
  const url = new URL(link);
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.pathname !== "/setup" ||
    url.search ||
    !/^#[a-f0-9]{64}$/.test(url.hash)
  )
    throw new Error("Use the private setup link copied from Commonplace.");
  return { origin: url.origin, code: url.hash.slice(1) };
}
export function validateManifest(manifest) {
  if (
    manifest.version !== 1 ||
    !Array.isArray(manifest.files) ||
    !manifest.files.length ||
    manifest.files.length > 30
  )
    throw new Error("Invalid companion release.");
  const required = [
    "package.json",
    "package-lock.json",
    "desktop/main.mjs",
    "desktop/setup-session.mjs",
    "desktop/native/bin/commonplace-target",
  ];
  for (const f of manifest.files)
    if (
      !/^(?:desktop\/[a-z-]+\.(?:mjs|cjs)|desktop\/native\/bin\/commonplace-target|lib\/protocol\.mjs|package(?:-lock)?\.json)$/.test(
        f.path,
      ) ||
      !Number.isInteger(f.size) ||
      f.size < 1 ||
      f.size > 2_000_000 ||
      !/^[a-f0-9]{64}$/.test(f.sha256)
    )
      throw new Error("Invalid companion file.");
  if (
    new Set(manifest.files.map((f) => f.path)).size !== manifest.files.length ||
    required.some((p) => !manifest.files.some((f) => f.path === p))
  )
    throw new Error("Incomplete companion release.");
  if (digest(JSON.stringify(manifest.files)) !== manifest.release)
    throw new Error("Release checksum mismatch.");
  return manifest;
}
async function download(url) {
  const r = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw new Error("Could not download companion (" + r.status + ").");
  return Buffer.from(await r.arrayBuffer());
}
export async function install(
  input,
  {
    home = homedir(),
    platform = process.platform,
    run = exec,
    onProgress = console.log,
  } = {},
) {
  if (platform !== "darwin")
    throw new Error(
      "The buddy currently needs a local macOS agent. Run this prompt on your Mac, not a cloud worker.",
    );
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error("Node.js 22.13 or newer is required.");
  const { origin, code } = parseSetupLink(input.link),
    space = digest(origin).slice(0, 16);
  const root = join(
      home,
      "Library",
      "Application Support",
      "Commonplace",
      space,
    ),
    data = join(root, "data"),
    lock = join(root, "install.lock");
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (e) {
    if (e.code === "EEXIST")
      throw new Error("Another setup is running. Wait for it to finish.");
    throw e;
  }
  try {
    const manifest = validateManifest(
      JSON.parse(
        (await download(origin + "/companion/manifest.json")).toString(),
      ),
    );
    const runtime = join(root, "releases", manifest.release);
    onProgress("Preparing buddy…");
    for (const file of manifest.files) {
      const target = join(runtime, file.path);
      let valid = false;
      try {
        valid = digest(await readFile(target)) === file.sha256;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (!valid) {
        const contents = await download(
          origin + "/companion/files/" + file.path,
        );
        if (contents.length !== file.size || digest(contents) !== file.sha256)
          throw new Error("Companion download checksum mismatch.");
        await mkdir(dirname(target), { recursive: true, mode: 0o700 });
        await writeFile(target + ".tmp", contents, { mode: 0o600 });
        await rename(target + ".tmp", target);
      }
    }
    await chmod(join(runtime, "desktop/native/bin/commonplace-target"), 0o755);
    const { findSetupSession } = await import(
      pathToFileURL(join(runtime, "desktop/setup-session.mjs")).href
    );
    const source = await findSetupSession(code, {
      home,
      file: input.transcriptPath,
    });
    if (input.title) source.title = String(input.title).slice(0, 120);
    const electron = join(
      runtime,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    try {
      await readFile(join(runtime, ".installed"));
      await readFile(join(runtime, "node_modules/electron/path.txt"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      onProgress("Installing the desktop runtime…");
      const env = { ...process.env };
      delete env.ELECTRON_SKIP_BINARY_DOWNLOAD;
      delete env.ELECTRON_RUN_AS_NODE;
      try {
        await run("npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], {
          cwd: runtime,
          env,
          timeout: 300000,
          maxBuffer: 2 * 1024 * 1024,
        });
      } catch {
        throw new Error(
          "Runtime download failed. Check your network and run setup again.",
        );
      }
      await writeFile(join(runtime, ".installed"), "1");
    }
    const id = randomUUID();
    await mkdir(data, { recursive: true, mode: 0o700 });
    // Only the expiring code touches disk; Electron exchanges it and encrypts the device key.
    await writeFile(
      join(data, "setup-request.json.tmp"),
      JSON.stringify({ id, origin, code, source }),
      { mode: 0o600 },
    );
    await rename(
      join(data, "setup-request.json.tmp"),
      join(data, "setup-request.json"),
    );
    const label = "ai.commonplace." + space,
      agents = join(home, "Library", "LaunchAgents"),
      plist = join(agents, label + ".plist");
    await mkdir(agents, { recursive: true });
    const environment = {
      COMMONPLACE_ORIGIN: origin,
      COMMONPLACE_DATA_DIR: data,
      ...(process.env.CODEX_HOME ? { CODEX_HOME: process.env.CODEX_HOME } : {}),
    };
    const xml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${escapeXml(electron)}</string><string>${escapeXml(runtime)}</string></array><key>EnvironmentVariables</key><dict>${Object.entries(
      environment,
    )
      .map(([k, v]) => `<key>${k}</key><string>${escapeXml(v)}</string>`)
      .join(
        "",
      )}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>30</integer><key>ProcessType</key><string>Interactive</string></dict></plist>`;
    let same = false;
    try {
      same = (await readFile(plist, "utf8")) === xml;
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const service = `gui/${process.getuid()}/${label}`;
    if (!same) {
      try {
        await run("/bin/launchctl", ["bootout", service]);
      } catch {
        /* A first installation has no service. */
      }
      await writeFile(plist, xml, { mode: 0o600 });
      await run("/bin/launchctl", [
        "bootstrap",
        `gui/${process.getuid()}`,
        plist,
      ]);
    } else {
      try {
        await run("/bin/launchctl", ["kickstart", service]);
      } catch {
        await run("/bin/launchctl", [
          "bootstrap",
          `gui/${process.getuid()}`,
          plist,
        ]);
      }
    }
    await writeFile(
      join(root, "uninstall.mjs"),
      `import {execFileSync} from 'node:child_process';\nimport {unlinkSync} from 'node:fs';\ntry{execFileSync('/bin/launchctl',['bootout',${JSON.stringify(service)}]);}catch{}\nunlinkSync(${JSON.stringify(plist)});\nconsole.log('Buddy stopped. Saved collections and local credentials were retained.');\n`,
      { mode: 0o600 },
    );
    onProgress("Connecting this conversation…");
    const deadline = Date.now() + 180000;
    while (Date.now() < deadline) {
      let receipt;
      try {
        receipt = JSON.parse(
          await readFile(join(data, "receipts", id + ".json"), "utf8"),
        );
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (receipt) {
        if (!receipt.ok) throw new Error(receipt.error);
        onProgress(
          "Buddy connected. This session will keep syncing while your Mac is awake.",
        );
        return receipt;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error(
      "Buddy is installed but has not confirmed connection yet. Check for a macOS prompt; do not report Connected until setup completes.",
    );
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    let input = "";
    for await (const chunk of process.stdin) {
      input += chunk;
      if (input.length > 16384) throw new Error("Setup input too large.");
    }
    await install(JSON.parse(input));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
