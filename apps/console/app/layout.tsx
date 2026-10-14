import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "./shell";

export const metadata: Metadata = {
  title: "HackSwarm Dispatch",
  description: "Watch the coding agents and approve the moves that stick.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Dispatch", statusBarStyle: "black" },
};

export const viewport: Viewport = {
  themeColor: "#14160f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Syne:wght@700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
