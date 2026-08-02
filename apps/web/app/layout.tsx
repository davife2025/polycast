import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Polycast — Interoperable Prediction Markets",
  description:
    "Prediction markets settled against verified, cross-chain oracle consensus on Flare.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
