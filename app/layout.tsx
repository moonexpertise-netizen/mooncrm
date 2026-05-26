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
  title: "CRM | MOON Expertise",
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
        {/* Skip-link a11y : passe directement au contenu principal au clavier */}
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[2000] focus-visible:px-3 focus-visible:py-2 focus-visible:rounded-md focus-visible:bg-zinc-900 focus-visible:text-white focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          Aller au contenu
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
