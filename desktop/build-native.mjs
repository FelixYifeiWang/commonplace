import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./native/", import.meta.url));
if (process.platform !== "darwin")
  throw new Error("Drag-to-session currently requires macOS.");
mkdirSync(root + "bin", { recursive: true });
execFileSync(
  "/usr/bin/swiftc",
  [
    "-O",
    root + "Target.swift",
    "-o",
    root + "bin/commonplace-target",
    "-framework",
    "AppKit",
    "-framework",
    "CoreGraphics",
  ],
  { stdio: "inherit" },
);
console.log("Native target helper built.");
