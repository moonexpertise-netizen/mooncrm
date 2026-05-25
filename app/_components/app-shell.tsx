"use client";

import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Sidebar, SIDEBAR_EVENT, SIDEBAR_STORAGE_KEY } from "./sidebar";
import { ClientSwitcher } from "./client-switcher";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    setMounted(true);

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

  return (
    <div className="min-h-screen">
      <Suspense fallback={null}>
        <Sidebar />
      </Suspense>
      <main
        className="min-h-screen transition-[margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{ marginLeft: mounted ? (collapsed ? 56 : 240) : 240 }}
      >
        {/* Bandeau supérieur : sélecteur global de dossier (Ctrl/⌘ + F).
            Sticky pour rester visible, sans entrer en collision avec les
            entêtes de page (nav ← N/N → de la fiche client, etc.). */}
        <div className="sticky top-0 z-30 bg-[hsl(var(--background))]/85 backdrop-blur border-b border-zinc-200/60">
          <div className="mx-auto w-full max-w-screen-2xl px-6 py-2 flex items-center justify-end">
            <ClientSwitcher />
          </div>
        </div>
        <div className="mx-auto w-full max-w-screen-2xl px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
