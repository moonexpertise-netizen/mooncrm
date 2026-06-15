import type { Metadata } from "next";
import { Funnel_Display, Funnel_Sans } from "next/font/google";
import "./globals.css";
import { AppShell } from "./_components/app-shell";
import { ThemedToaster } from "./_components/themed-toaster";
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
      className={`${funnelDisplay.variable} ${funnelSans.variable}`}
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
          {/* Toasts globaux (succes / erreur / info) - top-right. Le theme
              suit le theme RESOLU de l'app (navy -> dark) via ThemedToaster,
              et non l'OS, sinon les toasts detonnent en navy/clair OS. */}
          <ThemedToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
