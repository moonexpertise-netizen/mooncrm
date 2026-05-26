"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Menu } from "lucide-react";
import {
  Sidebar,
  SIDEBAR_EVENT,
  SIDEBAR_MOBILE_EVENT,
  SIDEBAR_STORAGE_KEY,
} from "./sidebar";
import { ClientSwitcher } from "./client-switcher";
import CommandPalette from "./command-palette";
import { TRACKERS } from "@/app/obligations/trackers";

/**
 * Retourne le label de la page courante pour l'afficher dans le ruban mobile.
 * Couvre les pages principales (mapping pathname → label) + les routes
 * dynamiques (fiche client, tracker production) où on extrait le slug.
 */
function pageLabel(pathname: string): string {
  // Pages dynamiques : tracker production
  if (pathname.startsWith("/obligations/")) {
    const trackerSlug = pathname.split("/")[2];
    const tracker = TRACKERS.find((t) => t.slug === trackerSlug);
    return tracker?.title ?? "Production";
  }
  // Pages dynamiques : fiche client (et sous-routes)
  if (pathname.startsWith("/clients/") && pathname !== "/clients/nouveau") {
    const segments = pathname.split("/");
    const slug = segments[2];
    if (!slug) return "Clients";
    // Reformate le slug en titre : "adelex-consulting" → "Adelex Consulting"
    const denomination = slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const sub = segments[3]; // exercice / obligations / onboarding
    if (sub === "exercice") return `${denomination} · Échéances`;
    if (sub === "obligations") return `${denomination} · Obligations`;
    if (sub === "onboarding") return `${denomination} · Onboarding`;
    return denomination;
  }
  // Pages statiques
  if (pathname === "/") return "Dashboard";
  if (pathname === "/clients") return "Clients";
  if (pathname === "/clients/nouveau") return "Nouveau client";
  if (pathname === "/pipeline") return "Pipeline";
  if (pathname === "/parametrage") return "Paramétrage";
  if (pathname === "/obligations") return "Production";
  if (pathname === "/onboarding") return "Onboarding";
  if (pathname.startsWith("/admin/users")) return "Utilisateurs";
  return "MoonCRM";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setMounted(true);

    // Détection mobile via matchMedia (synchronisé avec le breakpoint md: Tailwind)
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);

    const onToggle = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setCollapsed(Boolean(ce.detail));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === SIDEBAR_STORAGE_KEY) setCollapsed(e.newValue === "1");
    };
    window.addEventListener(SIDEBAR_EVENT, onToggle);
    window.addEventListener("storage", onStorage);
    return () => {
      mq.removeEventListener("change", onChange);
      window.removeEventListener(SIDEBAR_EVENT, onToggle);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const hideShell =
    pathname === "/login" ||
    pathname === "/en-attente" ||
    pathname.startsWith("/auth/");

  if (hideShell) {
    return <>{children}</>;
  }

  function openMobileSidebar() {
    window.dispatchEvent(
      new CustomEvent(SIDEBAR_MOBILE_EVENT, { detail: true })
    );
  }

  return (
    <div className="min-h-screen">
      {/* Cmd+K / Ctrl+K : palette globale de navigation (clients + routes) */}
      <CommandPalette />
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <main
        id="main-content"
        className="min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          // Mobile : pas de margin (le drawer overlay au-dessus). Desktop :
          // selon collapsed. Avant mount, fallback à 240 pour éviter un flash.
          marginLeft: isMobile ? 0 : mounted ? (collapsed ? 56 : 240) : 240,
        }}
      >
        {/* Bandeau supérieur clair (look SaaS moderne : Linear / Attio).
            Plus de fond dark — le sidebar reste l'élément navy MOON, le
            ribbon devient un liseré subtle pour lui faire respirer. */}
        <div className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-zinc-200/80">
          <div className="mx-auto w-full max-w-screen-2xl px-3 md:px-6 h-14 flex items-center gap-2 md:justify-between">
            {/* Hamburger : visible uniquement sur mobile */}
            <button
              type="button"
              onClick={openMobileSidebar}
              aria-label="Ouvrir le menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-zinc-700 hover:bg-zinc-100 transition-colors shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Titre de section sur mobile uniquement */}
            <h1 className="md:hidden text-sm font-semibold text-zinc-900 truncate flex-1 min-w-0">
              {pageLabel(pathname)}
            </h1>
            <div className="hidden md:flex items-center gap-3 md:ml-auto">
              <CommandPaletteHint />
              <ClientSwitcher />
            </div>
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-2xl px-3 md:px-6 py-4 md:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}

/**
 * Pastille discrète Cmd+K dans le ruban du haut.
 * Pure visuelle — la palette s'ouvre via le keyboard shortcut écouté dans
 * CommandPalette. Cliquer dessus déclenche un event keydown synthétique.
 */
function CommandPaletteHint() {
  const isMac =
    typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  function open() {
    // Synthétise Cmd+K / Ctrl+K pour activer le listener
    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
    });
    window.dispatchEvent(event);
  }
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Ouvrir la palette de recherche"
      className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-zinc-500 hover:text-zinc-700 text-xs transition-colors min-w-[200px]"
    >
      <span className="flex-1 text-left">Rechercher…</span>
      <kbd className="inline-flex items-center px-1.5 py-0.5 rounded-md border border-zinc-200 bg-zinc-50 text-[10px] font-medium tabular-nums text-zinc-500">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
