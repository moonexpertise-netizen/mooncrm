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
  if (pathname === "/economie") return "Économie";
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
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <main
        className="min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          // Mobile : pas de margin (le drawer overlay au-dessus). Desktop :
          // selon collapsed. Avant mount, fallback à 240 pour éviter un flash.
          marginLeft: isMobile ? 0 : mounted ? (collapsed ? 56 : 240) : 240,
        }}
      >
        {/* Bandeau supérieur sombre (cohérence avec la sidebar) :
            hamburger mobile + titre de section + switcher. Sticky. */}
        <div className="sticky top-0 z-30 bg-[#0D1122] border-b border-white/10">
          <div className="mx-auto w-full max-w-screen-2xl px-3 md:px-6 py-2 flex items-center gap-2 md:justify-between">
            {/* Hamburger : visible uniquement sur mobile */}
            <button
              type="button"
              onClick={openMobileSidebar}
              aria-label="Ouvrir le menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-zinc-200 hover:bg-white/10 transition-colors shrink-0"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Titre de section : sert de repère "où je suis" sur mobile.
                Caché en desktop (la sidebar fait déjà ce rôle). */}
            <h1 className="md:hidden text-sm font-semibold text-zinc-100 truncate flex-1 min-w-0">
              {pageLabel(pathname)}
            </h1>
            {/* ClientSwitcher : caché sur mobile (le drawer + liste Clients
                font le boulot). Sur desktop, alignement droite via ml-auto. */}
            <div className="hidden md:block md:ml-auto">
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
