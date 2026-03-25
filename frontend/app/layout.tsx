import "./globals.css";
import "@rainbow-me/rainbowkit/styles.css";

import type { Metadata } from "next";

import { AppProviders } from "@/components/providers";

export const metadata: Metadata = {
  title: "SplitLend",
  description: "Private position splitting for collateralized lending"
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
