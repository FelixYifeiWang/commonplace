import { ImageResponse } from "next/og";
export const alt = "Newron";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#fff",
        color: "#262626",
        fontFamily: "serif",
        fontSize: 120,
        letterSpacing: "-6px",
      }}
    >
      Newron
    </div>,
    size,
  );
}
