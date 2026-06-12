import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VGC Featured Match Finder",
  description: "Partidas em destaque por produto de Championship Points"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
