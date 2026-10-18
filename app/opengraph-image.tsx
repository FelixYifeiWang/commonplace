import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
export const alt = "Newron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default async function Image() {
  const icon = await readFile(join(process.cwd(), "public/nox-icon.png"));
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 32,
        background: "#fff",
        color: "#262626",
        fontFamily: "serif",
        fontSize: 120,
        letterSpacing: "-6px",
      }}
    >
      <img
        src={`data:image/png;base64,${icon.toString("base64")}`}
        width={132}
        height={132}
        alt=""
      />
      Newron
    </div>,
    size,
  );
}
