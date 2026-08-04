import type { Metadata } from "next";
import { permanentMarker, sourceSerif } from "@/lib/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "RippinPix — Discount Bin",
  description:
    "Dig through a cardboard bin of sealed photo packs. Pull one, rip it open, build the haul.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sourceSerif.variable} ${permanentMarker.variable}`}>
      <body>{children}</body>
    </html>
  );
}
