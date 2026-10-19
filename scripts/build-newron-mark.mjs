// Writes Newron's mark (Nox's resting N in its bubble) to the header mark and the favicon.
// Rebuild the desktop and Apple icons from it afterwards with: swift desktop/build-icons.swift
import { writeFileSync } from "node:fs";
import { noxSvg } from "../lib/newron-mark.mjs";

const svg = noxSvg();
for (const file of ["public/nox.svg", "public/favicon.svg"])
  writeFileSync(file, svg);
console.log(
  `Wrote public/nox.svg and public/favicon.svg (${svg.length} bytes each).`,
);
