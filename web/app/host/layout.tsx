import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Your wedding · Soundtracks", template: "%s · Soundtracks" },
  // Private pages for couples; nothing here belongs in search.
  robots: { index: false, follow: false },
};

export default function HostLayout({ children }: { children: React.ReactNode }) {
  return children;
}
