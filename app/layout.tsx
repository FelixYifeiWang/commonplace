import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://newron.app"),
  applicationName: "Newron",
  title: "Newron",
  openGraph: {
    type: "website",
    siteName: "Newron",
    title: "Newron",
    url: "https://newron.app",
    description:
      "Keep the ideas, references, and unexpected connections from your AI conversations.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Newron",
    images: ["/opengraph-image"],
  },
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
