import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./native/", import.meta.url));
if (process.platform !== "darwin")
  throw new Error("The native Nox helper requires macOS.");
mkdirSync(root + "bin", { recursive: true });
const release = process.argv.includes("--release");
const architectures = release
  ? ["arm64", "x86_64"]
  : [process.arch === "arm64" ? "arm64" : "x86_64"];
for (const arch of architectures) {
  execFileSync(
    "/usr/bin/swiftc",
    [
      "-O",
      "-target",
      `${arch}-apple-macos13.0`,
      root + "Target.swift",
      "-o",
      root + `bin/commonplace-target-${arch}`,
      "-framework",
      "AppKit",
      "-framework",
      "CoreGraphics",
      "-framework",
      "CoreServices",
    ],
    { stdio: "inherit" },
  );
}
execFileSync(
  "/usr/bin/lipo",
  [
    "-create",
    ...architectures.map((arch) => root + `bin/commonplace-target-${arch}`),
    "-output",
    release
      ? root + "../release/commonplace-target"
      : root + "bin/commonplace-target",
  ],
  { stdio: "inherit" },
);
console.log(
  release ? "Universal companion helper built." : "Native target helper built.",
);
