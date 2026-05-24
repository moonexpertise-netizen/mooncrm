import type { Metadata } from "next";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/app-shell";

const funnelDisplay = Funnel_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
});

const funnelSans = Funnel_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "MoonCRM",
  description: "CRM interne MOON Expertise",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${funnelDisplay.variable} ${funnelSans.variable}`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
