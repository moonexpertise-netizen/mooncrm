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
        {/* Bandeau supérieur : hamburger mobile + sélecteur de dossier.
            Sticky pour rester visible. */}
        <div className="sticky top-0 z-30 bg-[hsl(var(--background))]/85 backdrop-blur border-b border-zinc-200/60">
          <div className="mx-auto w-full max-w-screen-2xl px-3 md:px-6 py-2 flex items-center justify-between gap-2">
            {/* Hamburger : visible uniquement sur mobile */}
            <button
              type="button"
              onClick={openMobileSidebar}
              aria-label="Ouvrir le menu"
              className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-md text-zinc-700 hover:bg-zinc-100 transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden md:block" />
            <ClientSwitcher />
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-2xl px-3 md:px-6 py-4 md:py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
