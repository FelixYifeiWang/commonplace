import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Nox",
  applicationName: "Nox",
  description: "Newron’s desktop companion.",
  robots: { index: false, follow: false },
};
export default function BuddyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
