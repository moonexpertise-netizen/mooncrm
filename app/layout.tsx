import type { Metadata } from "next";
import { Fraunces, Funnel_Display, Funnel_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/app-shell";
import { ThemeProvider, THEME_INIT_SCRIPT } from "./_components/theme-provider";

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

// Fraunces (serif chic) — utilisée pour les titres d'accent quand pertinent
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
      // suppressHydrationWarning : on modifie className/data-attrs avant
      // hydratation via le script inline (anti-FOUC). Sans cette prop,
      // React warn d'un mismatch attendu.
      suppressHydrationWarning
      className={`${funnelDisplay.variable} ${funnelSans.variable} ${fraunces.variable}`}
    >
      <head>
        {/* Script anti-FOUC : applique la classe `dark` sur <html> AVANT
            React, evite le flash blanc -> sombre au chargement. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        {/* Skip-link a11y : passe directement au contenu principal au clavier */}
        <a
          href="#main-content"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-[2000] focus-visible:px-3 focus-visible:py-2 focus-visible:rounded-md focus-visible:bg-zinc-900 dark:focus-visible:bg-zinc-50 focus-visible:text-white dark:focus-visible:text-zinc-900 focus-visible:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          Aller au contenu
        </a>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
