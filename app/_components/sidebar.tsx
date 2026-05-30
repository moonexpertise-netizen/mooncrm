"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  GitBranch,
  GripVertical,
  LayoutDashboard,
  LineChart,
  LogOut,
  Receipt,
  Settings2,
  ShieldCheck,
  Stamp,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TRACKERS, TRACKER_GROUPS } from "@/app/obligations/trackers";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export const SIDEBAR_STORAGE_KEY = "moon.sidebar.collapsed";
export const SIDEBAR_EVENT = "moon:sidebar-toggle";
/** Event mobile : ouverture/fermeture du drawer. detail = boolean (open) */
export const SIDEBAR_MOBILE_EVENT = "moon:sidebar-mobile-toggle";
/** Année sélectionnée dans le module Production. Persistée pour rester active
 *  quand on navigue entre les sous-trackers. */
const OBLIGATIONS_YEAR_KEY = "moon.obligations.year";
/** Ordre custom des items de navigation (drag-and-drop). Stocke un tableau
 *  de hrefs dans l'ordre voulu par l'utilisateur. */
const NAV_ORDER_KEY = "moon.sidebar.nav-order";

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
        href: `/obligations/${t.slug}`,
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
  { href: "/clients", label: "Clients", icon: Users, matchPrefix: "/clients" },
  { href: "/pipeline", label: "Pipeline", icon: GitBranch, matchPrefix: "/pipeline" },
  { href: "/onboarding", label: "Onboarding", icon: Workflow, matchPrefix: "/onboarding" },
  { href: "/parametrage", label: "Paramétrage", icon: Settings2, matchPrefix: "/parametrage" },
  // Missions ponctuelles : transferts de siege, evaluations, attestations, AG
  // extraordinaires, audits... Place juste au-dessus de Production car c'est
  // un autre type de production (non-recurrent).
  {
    href: "/missions/exceptionnelles",
    label: "Missions exc.",
    icon: Briefcase,
    matchPrefix: "/missions/exceptionnelles",
  },
  {
    href: "/obligations",
    label: "Production",
    icon: ClipboardList,
    matchPrefix: "/obligations",
    children: buildProductionChildren(),
  },
  // Missions hors expertise comptable (declarations IR/IFI + commissaire aux
  // apports). Placees apres Production dans la sidebar.
  { href: "/missions/ir", label: "IR + IFI", icon: Receipt, matchPrefix: "/missions/ir" },
  { href: "/missions/caa", label: "CAA", icon: Stamp, matchPrefix: "/missions/caa" },
  // Facturation centralisee : agrege les factures a emettre de tous les modules.
  { href: "/facturation", label: "Facturation", icon: Wallet, matchPrefix: "/facturation" },
  { href: "/finance", label: "Finance", icon: LineChart, matchPrefix: "/finance" },
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

/**
 * Transforme un email en nom d'affichage humain pour éviter d'afficher
 * l'email complet dans l'UI (risque info exploitable par un attaquant qui
 * regarde l'écran).
 *
 * Ex. "prenom.nom@example.com" → "Prenom Nom"
 *     "j.dupont@example.com" → "J Dupont"
 *     "admin" → "Admin"
 */
function displayNameFromEmail(email: string): string {
  if (!email) return "Utilisateur";
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile drawer : ouvert via hamburger AppShell, fermé au scroll route change
  const [mobileOpen, setMobileOpen] = useState(false);
  // Détection mobile : sur mobile on force l'affichage complet (labels visibles)
  // même si `collapsed=true` dans localStorage côté desktop.
  const [isMobile, setIsMobile] = useState(false);
  // Ouvert si on charge déjà une page Production
  const [prodOpen, setProdOpen] = useState(() => pathname.startsWith("/obligations"));
  // Sous-blocs Production tous ouverts par défaut · clic sur l'en-tête replie celui-là
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  // Année Production mémorisée (localStorage)
  const [persistedObligationsYear, setPersistedObligationsYear] = useState<number | null>(null);
  // Profile du user logué : sert à afficher email dans le footer + lien
  // Admin → Utilisateurs si is_admin. Fetch une seule fois au mount.
  const [me, setMe] = useState<{ email: string; isAdmin: boolean } | null>(null);
  // Ordre custom des nav items (drag-and-drop). Initialise avec l'ordre
  // par defaut puis hydratte depuis localStorage cote client.
  const [navOrder, setNavOrder] = useState<string[]>(() => NAV_ITEMS.map((i) => i.href));
  // Flag qui passe a true apres l'hydratation localStorage. Sert a desactiver
  // les transitions/animations CSS sur le 1er render pour eviter le "shift"
  // visible quand le state initial != etat hydrate.
  const [hydrated, setHydrated] = useState(false);

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
    // Hydrate nav order. On filtre les hrefs qui n'existent plus (item supprime)
    // et on ajoute les nouveaux a la fin (rubrique creee apres le stockage).
    const storedOrder = localStorage.getItem(NAV_ORDER_KEY);
    if (storedOrder) {
      try {
        const parsed = JSON.parse(storedOrder) as string[];
        const validHrefs = new Set(NAV_ITEMS.map((i) => i.href));
        const cleaned = parsed.filter((h) => validHrefs.has(h));
        const missing = NAV_ITEMS.map((i) => i.href).filter((h) => !cleaned.includes(h));
        setNavOrder([...cleaned, ...missing]);
      } catch {
        // JSON invalide -> on garde l'ordre par defaut
      }
    }
    // Flag hydratation -> active les transitions des nav items sur le prochain render
    setHydrated(true);

    // Détection mobile : utilisé pour forcer l'affichage complet de la
    // sidebar (avec labels) même si `collapsed=true` côté desktop.
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onMqChange);

    // Écoute les ouvertures du drawer mobile depuis le hamburger AppShell
    const onMobileToggle = (e: Event) => {
      const ce = e as CustomEvent<boolean>;
      setMobileOpen(Boolean(ce.detail));
    };
    window.addEventListener(SIDEBAR_MOBILE_EVENT, onMobileToggle);
    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener(SIDEBAR_MOBILE_EVENT, onMobileToggle);
    };
  }, []);

  // Ferme automatiquement le drawer mobile au changement de route
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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

  // Ouvre automatiquement le sous-bloc qui contient le tracker courant.
  // Le tracker est maintenant identifié par le segment de path /obligations/<slug>.
  useEffect(() => {
    if (!pathname.startsWith("/obligations/")) return;
    const slug = pathname.split("/")[2];
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

  // Sur mobile, on force l'affichage déplié (labels visibles) même si
  // `collapsed=true` dans localStorage côté desktop. Le drawer fait 280px,
  // il y a largement la place pour les labels.
  const showCollapsed = !isMobile && collapsed;

  // Active tracker = 2e segment de path (ex. /obligations/ago-depot → "ago-depot")
  const activeSlug = pathname.startsWith("/obligations/") ? pathname.split("/")[2] ?? null : null;

  // Drag-drop : sensors + handler
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setNavOrder((prev) => {
      const oldIdx = prev.indexOf(String(active.id));
      const newIdx = prev.indexOf(String(over.id));
      if (oldIdx === -1 || newIdx === -1) return prev;
      const next = arrayMove(prev, oldIdx, newIdx);
      try {
        localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(next));
      } catch {
        // localStorage plein/bloque -> tant pis, l'etat React reste OK
      }
      return next;
    });
  }

  // NAV_ITEMS ordonnes selon navOrder (custom de l'utilisateur)
  const orderedNavItems = navOrder
    .map((href) => NAV_ITEMS.find((i) => i.href === href))
    .filter((i): i is NavItem => i !== undefined);

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
    <>
      {/* Overlay mobile (clic = ferme le drawer) */}
      <div
        onClick={() => {
          setMobileOpen(false);
          window.dispatchEvent(new CustomEvent(SIDEBAR_MOBILE_EVENT, { detail: false }));
        }}
        className={cn(
          "md:hidden fixed inset-0 z-30 bg-black/40 transition-opacity duration-300",
          mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 bg-[hsl(var(--sidebar))] text-zinc-300 flex flex-col border-r border-white/[0.10]",
          // Transitions desactivees jusqu'a hydratation localStorage pour ne pas
          // animer la bascule d'etat initial (width et translate) au refresh.
          hydrated && "transition-[width,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          // Mobile : drawer slide-in/out depuis la gauche
          "max-md:w-[280px]",
          mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          // Desktop : largeur dynamique selon collapsed
          "md:translate-x-0",
          collapsed ? "md:w-14" : "md:w-60"
        )}
      >
      {/* Hit-zone large cliquable sur tout le bord droit pour replier/déplier.
          Cachée sur mobile (le drawer s'ouvre via le hamburger AppShell). */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        title={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        className="hidden md:flex group/divider absolute top-0 -right-3.5 h-full w-7 z-50 cursor-pointer items-center justify-center"
      >
        {/* Trait vertical sur la bordure : neutre, doré au survol */}
        <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/10 group-hover/divider:bg-[hsl(var(--gold))]/70 group-hover/divider:w-0.5 transition-all duration-200" />
        {/* Pastille chevron : visible par défaut, dorée au survol */}
        <span
          className={cn(
            "flex items-center justify-center w-5 h-10 rounded-md bg-[hsl(var(--sidebar))] border shadow-md",
            "border-white/15 text-zinc-200",
            "group-hover/divider:border-[hsl(var(--gold))]/60 group-hover/divider:text-[hsl(var(--gold))] group-hover/divider:scale-110",
            "transition-all duration-150"
          )}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </span>
      </button>
      {/* Logo : full moon-logo.svg en mode étendu, favicon (icon.svg) compact en mode replié */}
      <div className={cn("h-14 flex items-center border-b border-white/[0.10] shrink-0", showCollapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/" className="flex items-center gap-2 group min-w-0" title="Retour au dashboard">
          {showCollapsed ? (
            <Image
              src="/icon.svg"
              alt="MOON"
              width={28}
              height={28}
              className="h-7 w-7 opacity-95 group-hover:opacity-100 transition-opacity"
              priority
            />
          ) : (
            <Image
              src="/moon-logo.svg"
              alt="MOON Expertise"
              width={188}
              height={44}
              className="h-11 w-auto opacity-95 group-hover:opacity-100 transition-opacity"
              priority
            />
          )}
        </Link>
      </div>

      {/* Nav. DndContext + SortableContext rendent chaque rubrique
          deplacable a la souris / clavier. L'ordre est persiste dans
          localStorage. */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={navOrder} strategy={verticalListSortingStrategy}>
        {/* Nav cachee jusqu'a hydratation localStorage. Evite que les items
            apparaissent dans l'ordre SSR (NAV_ITEMS par defaut) puis se
            re-arrangent quand React applique l'ordre client (localStorage).
            La hauteur est preservee donc pas de layout shift. */}
        <ul
          className={cn(
            "space-y-0.5 px-2",
            !hydrated && "invisible"
          )}
        >
          {orderedNavItems.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            const hasChildren = item.children && item.children.length > 0;
            const isProduction = item.href === "/obligations";
            const showChildren = hasChildren && !showCollapsed && isProduction && prodOpen;

            return (
              <SortableNavItem key={item.href} id={item.href} animate={hydrated} className="relative group/item">
                <div
                  className={cn(
                    "relative flex items-center rounded-md text-[13px]",
                    active
                      ? "bg-white/[0.08] text-white font-medium"
                      : "text-zinc-400"
                  )}
                >
                  {active && (
                    <span
                      className="absolute -left-2 top-2 bottom-2 w-[3px] rounded-r-full bg-[hsl(var(--gold))]"
                      aria-hidden
                    />
                  )}
                  <Link
                    href={withYear(item.href)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      if (isProduction && !showCollapsed) setProdOpen(true);
                    }}
                    className={cn(
                      "flex items-center gap-2.5 transition-colors flex-1 min-w-0 rounded-md",
                      showCollapsed ? "h-9 w-9 justify-center mx-auto" : "h-8 px-2",
                      !active && "hover:text-zinc-100 hover:bg-white/[0.05]"
                    )}
                    title={showCollapsed ? item.label : undefined}
                  >
                    <Icon className={cn("shrink-0", showCollapsed ? "h-[18px] w-[18px]" : "h-4 w-4")} />
                    {!showCollapsed && <span className="truncate flex-1">{item.label}</span>}
                  </Link>
                  {!showCollapsed && hasChildren && isProduction && (
                    <button
                      type="button"
                      aria-label={prodOpen ? "Replier la liste" : "Déplier la liste"}
                      onClick={() => setProdOpen((v) => !v)}
                      className="h-8 px-1.5 flex items-center justify-center rounded-md hover:bg-white/[0.08] hover:text-zinc-100 transition-colors"
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

                {/* Tooltip quand replié (uniquement desktop collapsed) */}
                {showCollapsed && (
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50 opacity-0 group-hover/item:opacity-100 transition-opacity">
                    <div className="bg-[hsl(var(--surface-elevated))] dark:bg-[hsl(var(--surface-elevated))] border border-white/10 text-zinc-100 text-xs px-2.5 py-1.5 rounded-md shadow-lg whitespace-nowrap">
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

                {/* Sous-menu Production - rubriques sur bandeau, sous-rubriques petites.
                    Note: les sous-items NE SONT PAS deplacables (ordre fixe par groupe
                    metier). Seuls les items de premier niveau sont reorderables. */}
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
                                "w-full flex items-center gap-1.5 px-2.5 py-2",
                                "bg-white/[0.06] border-y border-white/[0.06]",
                                !isFirstHeader && "mt-2.5",
                                "text-[10px] uppercase tracking-[0.14em] font-bold",
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
                            aria-current={childActive ? "page" : undefined}
                            className={cn(
                              "block pl-6 pr-2.5 py-1.5 rounded-md text-[11.5px] transition-colors truncate",
                              "relative leading-tight",
                              childActive
                                ? "text-[hsl(var(--gold))] bg-[hsl(var(--gold))]/10 font-medium"
                                : "text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.08]"
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
              </SortableNavItem>
            );
          })}
        </ul>
        </SortableContext>
        </DndContext>
      </nav>

      {/* User + actions */}
      <div className="border-t border-white/5 shrink-0">
        {!showCollapsed ? (
          <div className="px-3 py-3">
            {/* Affiche le nom déduit de l'email (sans révéler l'email complet,
                ni dans le texte ni en tooltip) pour ne pas donner d'info
                exploitable à quelqu'un qui regarderait l'écran. */}
            <div className="text-xs text-zinc-100 font-medium truncate">
              {me ? displayNameFromEmail(me.email) : "…"}
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
                    : "text-zinc-400 hover:text-[hsl(var(--gold))] hover:bg-white/[0.08]"
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

        {/* Bouton replier/déplier caché sur mobile (pas pertinent dans un drawer) */}
        <button
          type="button"
          onClick={toggle}
          className="hidden md:flex w-full items-center justify-center h-10 border-t border-white/5 text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
          title={collapsed ? "Déplier" : "Replier"}
          aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
    </>
  );
}

/**
 * Item de navigation sortable. Rend un <li> avec une poignee de drag visible
 * uniquement au hover (icone GripVertical a gauche). Le clic sur la poignee
 * active le drag sans interferer avec le clic sur le Link.
 */
function SortableNavItem({
  id,
  children,
  className,
  animate,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
  /** Active les transitions CSS de dnd-kit. Sur le 1er render (avant
   *  hydratation localStorage), on les desactive pour eviter un flash
   *  d'animation entre l'ordre par defaut (SSR) et l'ordre custom (client). */
  animate: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: animate ? transition : "none",
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className={cn(className, isDragging && "shadow-lg")}>
      {/* Poignee de drag : visible au hover, invisible sinon. Aligne avec
          le bord gauche, occupe peu d'espace pour ne pas decaler le layout. */}
      <button
        type="button"
        aria-label="Déplacer cette rubrique"
        title="Glisse pour réorganiser"
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10",
          "w-4 h-6 flex items-center justify-center rounded",
          "text-zinc-500 hover:text-[hsl(var(--gold))] hover:bg-white/[0.08]",
          "opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition-opacity",
          "cursor-grab active:cursor-grabbing touch-none"
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      {children}
    </li>
  );
}
