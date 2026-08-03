import type { Metadata } from "next";
import { sourceSerif } from "@/lib/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Plate Series — abe.cool",
  description:
    "Sealed photographic art cards. Tear the seal, pull the plates, build the collection.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={sourceSerif.variable}>
      <body>{children}</body>
    </html>
  );
}
