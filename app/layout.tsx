import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Commonplace",
  description:
    "Keep the ideas, references, and unexpected connections from your AI conversations.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
