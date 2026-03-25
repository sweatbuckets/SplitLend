import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

import type { Metadata } from "next";

import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "Karma Lending",
  description: "Privacy-oriented session-wallet lending flow"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
