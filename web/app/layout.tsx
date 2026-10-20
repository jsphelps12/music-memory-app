import type { Metadata } from "next";
import { DM_Serif_Display, DM_Sans, Newsreader } from "next/font/google";
import "./globals.css";

// Three voices (DESIGN.md): the serif names things, Newsreader sets what a
// person wrote, DM Sans runs the interface.
const serif = DM_Serif_Display({ weight: "400", subsets: ["latin"], variable: "--font-serif", display: "swap" });
const sans = DM_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const reading = Newsreader({ subsets: ["latin"], variable: "--font-reading", display: "swap" });

export const metadata: Metadata = {
  title: "Soundtracks",
  description: "A journal for the songs that mark your days.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${reading.variable}`}>
      <body>{children}</body>
    </html>
  );
}
