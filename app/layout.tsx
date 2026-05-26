import type { Metadata } from "next";
import { Fraunces, Funnel_Display, Funnel_Sans } from "next/font/google";
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

// Fraunces (serif chic) — utilisée pour le mot "CRM" dans le logo,
// cohérent avec l'identité MOON Expertise.
const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
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
    <html
      lang="fr"
      className={`${funnelDisplay.variable} ${funnelSans.variable} ${fraunces.variable}`}
    >
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
