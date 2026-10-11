import type { Metadata } from "next";
import "./globals.css";

// Three faces, from Google Fonts at runtime — a stylesheet link rather than
// next/font so the static export builds anywhere, Cloud Shell included.
const FONTS = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";

export const metadata: Metadata = {
  title: "Table for N",
  description: "One table. N people. One agent books the restaurant. How many of them actually ate?",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>{children}</body>
    </html>
  );
}
