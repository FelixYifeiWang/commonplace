// Nox's agent installer. No global packages, MCP, or agent settings are modified.
import {
  mkdir,
  copyFile,
  symlink,
  readFile,
  readlink,
  writeFile,
  rename,
  chmod,
  rm,
  access,
} from "node:fs/promises";
import { constants } from "node:fs";
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
    !["/setup", "/setup.md", "/SKILL.md", "/connect"].includes(url.pathname) ||
    url.search ||
    !/^#[a-f0-9]{64}$/.test(url.hash)
  )
    throw new Error("Use the private setup link copied from Newron.");
  return {
    origin: url.origin,
    code: url.hash.slice(1),
    action: url.pathname === "/connect" ? "connect" : "setup",
  };
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
      !/^(?:desktop\/[a-z-]+\.(?:mjs|cjs)|desktop\/native\/bin\/commonplace-target|desktop\/(?:commonplace\.(?:png|icns)|nox-tray\.png)|lib\/protocol\.mjs|package(?:-lock)?\.json)$/.test(
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
export async function verifyRuntime(runtime) {
  const root = join(runtime, "node_modules/electron");
  const executable = "Electron.app/Contents/MacOS/Electron";
  if ((await readFile(join(root, "path.txt"), "utf8")).trim() !== executable)
    throw new Error("Nox runtime is incomplete.");
  await access(join(root, "dist", executable), constants.X_OK);
  await access(join(root, "dist/Electron.app/Contents/Info.plist"));
  await access(
    join(
      root,
      "dist/Electron.app/Contents/Frameworks/Electron Framework.framework/Electron Framework",
    ),
  );
}
async function download(url) {
  const r = await fetch(url, {
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok)
    throw new Error("Could not download companion (" + r.status + ").");
  return Buffer.from(await r.arrayBuffer());
}
export async function bootstrapBuddy(
  plist,
  run = exec,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await run("/bin/launchctl", [
        "bootstrap",
        `gui/${process.getuid()}`,
        plist,
      ]);
      return;
    } catch (error) {
      // bootout can return before macOS has released the previous service.
      if (
        attempt === 2 ||
        !/Bootstrap failed: 5|Input\/output error/i.test(
          error.stderr || error.message || "",
        )
      )
        throw error;
      await wait(300 * (attempt + 1));
    }
  }
}
// Keep the existing storage and launch-service identity after the domain rename.
export function installationOrigin(origin) {
  return origin === "https://newron.app"
    ? "https://commonplace-pearl.vercel.app"
    : origin;
}

export async function installAppShortcut(home, appPath) {
  const applications = join(home, "Applications");
  const shortcut = join(applications, "Nox.app");
  await mkdir(applications, { recursive: true });
  try {
    await symlink(appPath, shortcut);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
  // Never replace another app or remove an alias we do not own.
  const pointsHere = async (file) => {
    try {
      return resolve(dirname(file), await readlink(file)) === resolve(appPath);
    } catch (error) {
      if (["ENOENT", "EINVAL"].includes(error.code)) return false;
      throw error;
    }
  };
  const legacy = join(applications, "Newron.app");
  if ((await pointsHere(shortcut)) && (await pointsHere(legacy)))
    await rm(legacy);
}

// A small app owns the URL scheme, so Electron's signed runtime stays untouched.
// All paths are fixed at installation. Incoming URLs never become shell commands.
export async function installLauncher(
  { root, origin, data, service, plist, space, helper, icon },
  run = exec,
) {
  const quote = (value) => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";
  const appPath = join(root, "Commonplace.app");
  const source = join(root, "open-buddy.applescript");
  const command = `/usr/bin/touch ${quote(join(data, "show-request"))}; /bin/launchctl kickstart ${quote(service)} || /bin/launchctl bootstrap ${quote(`gui/${process.getuid()}`)} ${quote(plist)}`;
  const origins =
    installationOrigin(origin) === "https://commonplace-pearl.vercel.app"
      ? ["https://commonplace-pearl.vercel.app", "https://newron.app"]
      : [origin];
  const links = origins.flatMap((value) => {
    const link = `commonplace://show?origin=${encodeURIComponent(value)}`;
    return [link, link.replace("show?", "show/?")];
  });
  await writeFile(
    source,
    `on run
  revealBuddy()
end run
on open location incomingURL
  if incomingURL is ${links.map((link) => JSON.stringify(link)).join(" or incomingURL is ")} then revealBuddy()
end open location
on revealBuddy()
  do shell script ${JSON.stringify(command)}
end revealBuddy
`,
    { mode: 0o600 },
  );
  await run("/usr/bin/osacompile", ["-o", appPath, source]);
  const info = join(appPath, "Contents/Info.plist");
  if (icon) {
    await mkdir(join(appPath, "Contents/Resources"), { recursive: true });
    await copyFile(icon, join(appPath, "Contents/Resources/commonplace.icns"));
    await run("/usr/bin/plutil", [
      "-replace",
      "CFBundleIconFile",
      "-string",
      "commonplace.icns",
      info,
    ]);
  }
  for (const args of [
    ["-replace", "CFBundleName", "-string", "Nox"],
    ["-replace", "CFBundleDisplayName", "-string", "Nox"],
    [
      "-replace",
      "CFBundleIdentifier",
      "-string",
      `ai.commonplace.opener.${space}`,
    ],
    ["-replace", "LSUIElement", "-bool", "true"],
    [
      "-replace",
      "CFBundleURLTypes",
      "-json",
      JSON.stringify([
        {
          CFBundleURLName: "Nox",
          CFBundleURLSchemes: ["commonplace"],
        },
      ]),
    ],
  ])
    await run("/usr/bin/plutil", [...args, info]);
  await run(
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister",
    ["-f", appPath],
  );
  const expected = `ai.commonplace.opener.${space}`;
  const result = await run(helper, ["--register-opener", expected]);
  let handler;
  try {
    handler = JSON.parse(result?.stdout || "{}").handler;
  } catch {
    /* Report one clear setup failure below. */
  }
  if (handler !== expected)
    throw new Error("Could not register the Nox launcher. Run setup again.");
  return appPath;
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
      "Nox currently needs a local macOS agent. Run this prompt on your Mac, not a cloud worker.",
    );
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13))
    throw new Error("Node.js 22.13 or newer is required.");
  const { origin, code, action } = parseSetupLink(input.link),
    space = digest(installationOrigin(origin)).slice(0, 16);
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
    let runtime;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const manifest = validateManifest(
          JSON.parse(
            (await download(origin + "/companion/manifest.json")).toString(),
          ),
        );
        runtime = join(root, "releases", manifest.release);
        onProgress("Preparing Nox…");
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
            if (
              contents.length !== file.size ||
              digest(contents) !== file.sha256
            )
              throw Object.assign(
                new Error(
                  "The Nox release changed during setup. Try setup again.",
                ),
                { code: "RELEASE_CHANGED" },
              );
            await mkdir(dirname(target), { recursive: true, mode: 0o700 });
            await writeFile(target + ".tmp", contents, { mode: 0o600 });
            await rename(target + ".tmp", target);
          }
        }
        break;
      } catch (error) {
        if (attempt || error.code !== "RELEASE_CHANGED") throw error;
        onProgress("Getting the latest Nox…");
      }
    }
    await chmod(join(runtime, "desktop/native/bin/commonplace-target"), 0o755);
    let source;
    if (action === "connect") {
      const { findSetupSession } = await import(
        pathToFileURL(join(runtime, "desktop/setup-session.mjs")).href
      );
      source = await findSetupSession(code, {
        home,
        file: input.transcriptPath,
        linkPath: "/connect",
      });
      if (input.title) source.title = String(input.title).slice(0, 120);
    }
    const electron = join(
      runtime,
      "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
    );
    try {
      await readFile(join(runtime, ".installed"));
      await verifyRuntime(runtime);
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
        // Current Electron packages install the binary on demand, not during npm ci.
        await run(
          process.execPath,
          [join(runtime, "node_modules/electron/install.js")],
          {
            cwd: runtime,
            env,
            timeout: 300000,
            maxBuffer: 2 * 1024 * 1024,
          },
        );
      } catch (error) {
        const detail = String(error.stderr || error.message || "");
        if (
          /EPERM|EACCES|Operation not permitted|Permission denied/i.test(detail)
        )
          throw new Error(
            "macOS blocked the Nox installation. Setup stopped. No session was connected.",
          );
        throw new Error(
          "Nox download failed. Check your connection and try again.",
        );
      }
      await verifyRuntime(runtime);
      await writeFile(join(runtime, ".installed"), "1");
    }
    const id = randomUUID();
    await mkdir(data, { recursive: true, mode: 0o700 });
    // Only the expiring code touches disk; Electron exchanges it and encrypts the device key.
    await writeFile(
      join(data, "setup-request.json.tmp"),
      JSON.stringify({
        id,
        origin,
        code,
        action,
        ...(source ? { source } : {}),
      }),
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
      COMMONPLACE_LAUNCHER: "1",
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
    await installLauncher(
      {
        root,
        origin,
        data,
        service,
        plist,
        space,
        helper: join(runtime, "desktop/native/bin/commonplace-target"),
        icon: join(runtime, "desktop/commonplace.icns"),
      },
      run,
    );
    await installAppShortcut(home, join(root, "Commonplace.app"));
    if (!same) {
      try {
        await run("/bin/launchctl", ["bootout", service]);
      } catch {
        /* A first installation has no service. */
      }
      await writeFile(plist, xml, { mode: 0o600 });
      await bootstrapBuddy(plist, run);
    } else {
      try {
        await run("/bin/launchctl", ["kickstart", service]);
      } catch {
        await bootstrapBuddy(plist, run);
      }
    }
    await writeFile(
      join(root, "uninstall.mjs"),
      `import {execFileSync} from 'node:child_process';\nimport {unlinkSync} from 'node:fs';\ntry{execFileSync('/bin/launchctl',['bootout',${JSON.stringify(service)}]);}catch{}\nunlinkSync(${JSON.stringify(plist)});\nconsole.log('Nox stopped. Saved collections and local credentials were retained.');\n`,
      { mode: 0o600 },
    );
    onProgress(action === "setup" ? "Starting Nox…" : "Connecting session…");
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
          action === "setup"
            ? "Nox ready. Choose a session to save in Newron."
            : "Session connected.",
        );
        return receipt;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Nox has not confirmed setup. Check for a macOS prompt.");
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
