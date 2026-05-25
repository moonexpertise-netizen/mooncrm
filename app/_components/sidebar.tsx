"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  GitBranch,
  LayoutDashboard,
  LogOut,
  Settings2,
  ShieldCheck,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { TRACKERS, TRACKER_GROUPS } from "@/app/obligations/trackers";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const SIDEBAR_STORAGE_KEY = "moon.sidebar.collapsed";
export const SIDEBAR_EVENT = "moon:sidebar-toggle";
/** Année sélectionnée dans le module Production. Persistée pour rester active
 *  quand on navigue entre les sous-trackers. */
const OBLIGATIONS_YEAR_KEY = "moon.obligations.year";

type ChildItem =
  | { kind: "header"; label: string; groupId: string }
  | { kind: "link"; href: string; label: string; slug: string; groupId: string };

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  matchPrefix?: string;
  children?: ChildItem[];
};

// Construit la liste des enfants Production en intercalant un header par groupe.
function buildProductionChildren(): ChildItem[] {
  const out: ChildItem[] = [];
  for (const g of TRACKER_GROUPS) {
    const groupTrackers = TRACKERS.filter((t) => t.group === g.id);
    if (groupTrackers.length === 0) continue;
    out.push({ kind: "header", label: g.label, groupId: g.id });
    for (const t of groupTrackers) {
      out.push({
        kind: "link",
        href: `/obligations/suivi?type=${t.slug}`,
        label: t.title,
        slug: t.slug,
        groupId: g.id,
      });
    }
  }
  return out;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, matchPrefix: "/pipeline" },
  { href: "/clients", label: "Clients", icon: Users, matchPrefix: "/clients" },
  { href: "/parametrage", label: "Paramétrage", icon: Settings2, matchPrefix: "/parametrage" },
  {
    href: "/obligations",
    label: "Production",
    icon: ClipboardList,
    matchPrefix: "/obligations",
    children: buildProductionChildren(),
  },
  { href: "/onboarding", label: "Onboarding", icon: Workflow, matchPrefix: "/onboarding" },
  { href: "/economie", label: "Économie", icon: TrendingUp, matchPrefix: "/economie" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === "/") return pathname === "/";
  if (item.matchPrefix) return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + "/");
  return pathname === item.href;
}

function broadcastCollapse(collapsed: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "1" : "0");
  window.dispatchEvent(new CustomEvent(SIDEBAR_EVENT, { detail: collapsed }));
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  // Ouvert si on charge déjà une page Production
  const [prodOpen, setProdOpen] = useState(() => pathname.startsWith("/obligations"));
  // Sous-blocs Production tous ouverts par défaut · clic sur l'en-tête replie celui-là
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  // Année Production mémorisée (localStorage)
  const [persistedObligationsYear, setPersistedObligationsYear] = useState<number | null>(null);
  // Profile du user logué : sert à afficher email dans le footer + lien
  // Admin → Utilisateurs si is_admin. Fetch une seule fois au mount.
  const [me, setMe] = useState<{ email: string; isAdmin: boolean } | null>(null);

  useEffect(() => {
    const sb = createClient();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: prof } = await sb
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      setMe({
        email: user.email ?? "",
        isAdmin: prof?.is_admin === true,
      });
    })();
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
    const yr = localStorage.getItem(OBLIGATIONS_YEAR_KEY);
    if (yr) {
      const n = parseInt(yr, 10);
      if (!Number.isNaN(n)) setPersistedObligationsYear(n);
    }
  }, []);

  // Synchronise localStorage avec ?year= de l'URL quand on est sur /obligations*
  useEffect(() => {
    if (!pathname.startsWith("/obligations")) return;
    const urlYear = searchParams?.get("year");
    if (!urlYear) return;
    const n = parseInt(urlYear, 10);
    if (Number.isNaN(n)) return;
    localStorage.setItem(OBLIGATIONS_YEAR_KEY, String(n));
    setPersistedObligationsYear(n);
  }, [pathname, searchParams]);

  useEffect(() => {
    if (pathname.startsWith("/obligations")) setProdOpen(true);
  }, [pathname]);

  // Ouvre automatiquement le sous-bloc qui contient le tracker courant
  useEffect(() => {
    if (pathname !== "/obligations/suivi") return;
    const slug = searchParams?.get("type");
    if (!slug) return;
    const t = TRACKERS.find((x) => x.slug === slug);
    if (!t) return;
    setClosedGroups((prev) => {
      if (!prev.has(t.group)) return prev;
      const next = new Set(prev);
      next.delete(t.group);
      return next;
    });
  }, [pathname, searchParams]);

  function toggleGroup(id: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ⚠ broadcastCollapse() dispatche un CustomEvent qui appelle setCollapsed
  // dans AppShell. Si on le met dans l'updater de setCollapsed (qui doit
  // être pur), React déclenche une mise à jour d'AppShell pendant le rendu
  // de Sidebar → warning "Cannot update a component while rendering...".
  // On met les effets de bord en dehors de l'updater.
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    broadcastCollapse(next);
  };

  const activeSlug = pathname === "/obligations/suivi" ? searchParams?.get("type") : null;

  // Année Production active : URL si on est sur /obligations*, sinon la
  // dernière mémorisée. Sert à propager ?year= dans les liens du sidebar.
  const activeObligationsYear = (() => {
    if (pathname.startsWith("/obligations")) {
      const u = searchParams?.get("year");
      if (u) {
        const n = parseInt(u, 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    return persistedObligationsYear;
  })();

  function withYear(href: string): string {
    if (activeObligationsYear === null) return href;
    if (!href.startsWith("/obligations")) return href;
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}year=${activeObligationsYear}`;
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 bg-[#0D1122] text-zinc-300 flex flex-col border-r border-white/5",
        "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Hit-zone large cliquable sur tout le bord droit pour replier/déplier.
          28px de large, centrée sur le bord — moitié intérieure, moitié extérieure.
          Pastille chevron toujours visible (opacité 60%), boostée au survol. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        title={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        className="group/divider absolute top-0 -right-3.5 h-full w-7 z-50 cursor-pointer flex items-center justify-center"
      >
        {/* Trait vertical sur la bordure : neutre, doré au survol */}
        <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover/divider:bg-[hsl(var(--gold))]/70 group-hover/divider:w-0.5 transition-all duration-200" />
        {/* Pastille chevron : visible par défaut, dorée au survol */}
        <span
          className={cn(
            "flex items-center justify-center w-5 h-10 rounded-md bg-[#0D1122] border shadow-md",
            "border-white/15 text-zinc-400/70",
            "group-hover/divider:border-[hsl(var(--gold))]/60 group-hover/divider:text-[hsl(var(--gold))] group-hover/divider:scale-110",
            "transition-all duration-150"
          )}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </span>
      </button>
      {/* Logo */}
      <div className={cn("h-16 flex items-center border-b border-white/5 shrink-0", collapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/" className="flex items-center gap-2 group min-w-0" title="MoonCRM">
          <Image
            src="/moon-logo.svg"
            alt="MOON"
            width={140}
            height={32}
            className={cn("h-7 w-auto opacity-95 group-hover:opacity-100 transition-opacity", collapsed && "h-6")}
            priority
          />
          {!collapsed && (
            <span className="text-[hsl(var(--gold))] text-sm font-display tracking-wide">CRM</span>
          )}
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <ul className="space-y-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isProduction = item.href === "/obligations";
            const showChildren = hasChildren && !collapsed && isProduction && prodOpen;

            return (
              <li key={item.href} className="relative group/item">
                <div
                  className={cn(
                    "relative flex items-center rounded-md text-sm",
                    active
                      ? "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]"
                      : "text-zinc-300"
                  )}
                >
                  {active && (
                    <span
                      className="absolute -left-2 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[hsl(var(--gold))]"
                      aria-hidden
                    />
                  )}
                  <Link
                    href={withYear(item.href)}
                    onClick={() => {
                      if (isProduction && !collapsed) setProdOpen(true);
                    }}
                    className={cn(
                      "flex items-center gap-3 transition-colors flex-1 min-w-0 rounded-md",
                      collapsed ? "h-10 w-10 justify-center mx-auto" : "h-9 px-2.5",
                      !active && "hover:text-zinc-100 hover:bg-white/5"
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon className={cn("shrink-0", collapsed ? "h-5 w-5" : "h-[18px] w-[18px]")} />
                    {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  </Link>
                  {!collapsed && hasChildren && isProduction && (
                    <button
                      type="button"
                      aria-label={prodOpen ? "Replier la liste" : "Déplier la liste"}
                      onClick={() => setProdOpen((v) => !v)}
                      className="h-9 px-2 flex items-center justify-center rounded-md hover:bg-white/10 hover:text-zinc-100 transition-colors"
                    >
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 opacity-70 transition-transform",
                          prodOpen && "rotate-180"
                        )}
                      />
                    </button>
                  )}
                </div>

                {/* Tooltip quand replié */}
                {collapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <div className="bg-[#0D1122] border border-white/10 text-zinc-100 text-xs px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
                      {item.label}
                      {isProduction && hasChildren && item.children && (
                        <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1 max-h-80 overflow-auto">
                          {item.children.map((c, i) =>
                            c.kind === "header" ? (
                              <div
                                key={`h-${i}`}
                                className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold pt-1.5 first:pt-0"
                              >
                                {c.label}
                              </div>
                            ) : (
                              <div
                                key={c.slug}
                                className="text-zinc-300 text-[11px] pl-1.5"
                              >
                                {c.label}
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Sous-menu Production — rubriques sur bandeau, sous-rubriques petites */}
                {showChildren && item.children && (
                  <ul className="mt-1 mb-2">
                    {item.children.map((c, i) => {
                      if (c.kind === "header") {
                        const isClosed = closedGroups.has(c.groupId);
                        const isFirstHeader = i === 0;
                        return (
                          <li key={`h-${c.groupId}`}>
                            <button
                              type="button"
                              onClick={() => toggleGroup(c.groupId)}
                              className={cn(
                                // Bandeau : bg subtil sur toute la largeur, border haut/bas
                                "w-full flex items-center gap-1.5 px-2.5 py-1.5",
                                "bg-white/[0.04] border-y border-white/[0.06]",
                                !isFirstHeader && "mt-1",
                                "text-[9.5px] uppercase tracking-[0.14em] font-bold",
                                "text-zinc-200 hover:text-[hsl(var(--gold))] hover:bg-white/[0.07] transition-colors"
                              )}
                            >
                              <ChevronDown
                                className={cn(
                                  "h-3 w-3 opacity-70 transition-transform shrink-0",
                                  isClosed && "-rotate-90"
                                )}
                              />
                              <span className="truncate flex-1 text-left">{c.label}</span>
                            </button>
                          </li>
                        );
                      }
                      if (closedGroups.has(c.groupId)) return null;
                      const childActive = activeSlug === c.slug;
                      return (
                        <li key={c.slug}>
                          <Link
                            href={withYear(c.href)}
                            className={cn(
                              "block pl-6 pr-2.5 py-1 rounded-md text-[11px] transition-colors truncate",
                              "relative leading-tight",
                              childActive
                                ? "text-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10 font-medium"
                                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
                            )}
                          >
                            {childActive && (
                              <span
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-[hsl(var(--gold))]"
                                aria-hidden
                              />
                            )}
                            {c.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User + actions */}
      <div className="border-t border-white/5 shrink-0">
        {!collapsed ? (
          <div className="px-3 py-3">
            <div className="text-xs text-zinc-100 font-medium truncate" title={me?.email}>
              {me?.email ?? "…"}
            </div>
            <div className="text-[11px] text-zinc-500 truncate">
              {me?.isAdmin ? "Administrateur" : "MOON Expertise"}
            </div>
            {me?.isAdmin && (
              <Link
                href="/admin/users"
                className={cn(
                  "mt-2 w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold))]"
                    : "text-zinc-400 hover:text-[hsl(var(--gold))] hover:bg-white/5"
                )}
                title="Gestion des utilisateurs"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Utilisateurs
              </Link>
            )}
            <form action="/auth/logout" method="post" className="mt-1">
              <button
                type="submit"
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-zinc-400 hover:text-[hsl(var(--gold))] hover:bg-white/5 transition-colors"
                title="Se déconnecter"
              >
                <LogOut className="h-3.5 w-3.5" />
                Déconnexion
              </button>
            </form>
          </div>
        ) : (
          <form action="/auth/logout" method="post" className="px-2 py-3 flex justify-center">
            <button
              type="submit"
              className="h-10 w-10 flex items-center justify-center rounded-md text-zinc-400 hover:text-[hsl(var(--gold))] hover:bg-white/5 transition-colors"
              title="Se déconnecter"
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-center h-10 border-t border-white/5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title={collapsed ? "Déplier" : "Replier"}
          aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
