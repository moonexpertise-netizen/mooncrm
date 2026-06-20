"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ClipboardList,
  GaugeCircle,
  GitBranch,
  GripVertical,
  LayoutDashboard,
  LineChart,
  LogOut,
  Receipt,
  Settings2,
  ShieldCheck,
  Sparkles,
  Stamp,
  Users,
  Wallet,
  Workflow,
  Clock,
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
import { resolveRole, effectivePermissions, ROLE_LABELS, type Permission, type Role } from "@/lib/permissions";
import { loadSidebarBadges } from "./sidebar-badges-loader";

/** Rubriques de nav réservées à une permission (masquées sinon). */
const NAV_PERMISSION: Record<string, Permission> = {
  "/finance": "view_finance",
  "/facturation": "view_facturation",
  "/parametrage": "edit_parametrage",
  "/temps": "saisir_temps",
};

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
  /** Clef pour mapper avec les badges "À faire" (cf. loadSidebarBadges). */
  badgeKey?: "creations" | "ir" | "caa" | "facturation";
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
    label: "Échéances",
    icon: ClipboardList,
    matchPrefix: "/obligations",
    children: buildProductionChildren(),
  },
  // Missions hors expertise comptable (creations, declarations IR/IFI,
  // commissariat aux apports). Placees apres Production dans la sidebar.
  // Creations en premier (chrono metier : on cree, puis on declare, puis CAA).
  // badgeKey : compteur "A faire" affiche en pastille rouge cf. loadSidebarBadges.
  { href: "/missions/creations", label: "Créations", icon: Sparkles, matchPrefix: "/missions/creations", badgeKey: "creations" },
  { href: "/missions/ir", label: "IR + IFI", icon: Receipt, matchPrefix: "/missions/ir", badgeKey: "ir" },
  { href: "/missions/caa", label: "CAA", icon: Stamp, matchPrefix: "/missions/caa", badgeKey: "caa" },
  { href: "/missions/pilotage", label: "Pilotage", icon: GaugeCircle, matchPrefix: "/missions/pilotage" },
  { href: "/temps", label: "Mes temps", icon: Clock, matchPrefix: "/temps" },
  // Facturation centralisee : agrege les factures a emettre de tous les modules.
  // badgeKey : compteur de factures a etablir (etat_facturation = 'a_facturer')
  // cumule sur les 5 sources (obligations / CAA / IR / missions exc / creations).
  { href: "/facturation", label: "Facturation", icon: Wallet, matchPrefix: "/facturation", badgeKey: "facturation" },
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
  const [me, setMe] = useState<{ email: string; isAdmin: boolean; role: Role } | null>(null);
  // Droits effectifs (base role_permissions, fallback code) pour masquer les
  // rubriques. Vide tant que pas chargé → on cache les rubriques gatées.
  const [perms, setPerms] = useState<Set<Permission>>(new Set());
  // Badges "A faire" sur Creations / IR / CAA + factures a etablir sur
  // Facturation. Charges au mount + a chaque changement de route (cf. effet
  // plus bas) pour rester a jour.
  const [badges, setBadges] = useState<{
    creations: number;
    ir: number;
    caa: number;
    facturation: number;
  }>({
    creations: 0,
    ir: 0,
    caa: 0,
    facturation: 0,
  });
  // Throttle des badges : on evite de relancer les 9 requetes DB a CHAQUE
  // navigation (c'etait un gros surcout par clic en prod). On rafraichit au
  // montage, puis au plus une fois toutes les 15s sur changement de route, et
  // au retour de focus/onglet. Suffisant pour refleter un changement de statut
  // sans marteler la DB. `force` court-circuite le throttle (montage / focus).
  const lastBadgeFetchRef = useRef(0);
  const refreshBadges = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastBadgeFetchRef.current < 15000) return;
    lastBadgeFetchRef.current = now;
    loadSidebarBadges()
      .then((b) => setBadges(b))
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.error("[sidebar-badges] error:", e);
      });
  }, []);
  // Ordre custom des nav items (drag-and-drop). Initialise avec l'ordre
  // par defaut puis hydratte depuis localStorage cote client.
  const [navOrder, setNavOrder] = useState<string[]>(() => NAV_ITEMS.map((i) => i.href));
  // Flag qui passe a true apres l'hydratation localStorage. Sert a desactiver
  // les transitions/animations CSS sur le 1er render pour eviter le "shift"
  // visible quand le state initial != etat hydrate.
  const [hydrated, setHydrated] = useState(false);
  // Flyout (tooltip / sous-menu Production) en mode REPLIE. Rendu en portail
  // `fixed` sur <body> car le <nav> est scrollable (overflow-y-auto force
  // overflow-x a clipper) : un tooltip `absolute` y serait coupe. On mesure
  // la position de l'item au survol. cf. fix audit "tooltips/flyout clippes".
  const [flyout, setFlyout] = useState<{ item: NavItem; top: number; left: number } | null>(null);

  useEffect(() => {
    const sb = createClient();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: prof } = await sb
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      const r = resolveRole(prof ?? {});
      setMe({
        email: user.email ?? "",
        isAdmin: prof?.is_admin === true,
        role: r,
      });
      // Droits effectifs (base role_permissions, éditable via /admin/roles ;
      // fallback code). Sert à masquer les rubriques non autorisées.
      if (r === "admin") {
        setPerms(effectivePermissions("admin", null));
      } else {
        const { data: rows } = await sb.from("role_permissions").select("role, permission");
        setPerms(effectivePermissions(r, rows ?? null));
      }
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

  // Badges "À faire" (Créations / IR / CAA / Facturation). Montage = fetch
  // immédiat ; retour de focus / onglet visible = refresh (throttlé). Voir
  // refreshBadges pour la logique de throttle.
  useEffect(() => {
    refreshBadges(true);
    const onFocus = () => refreshBadges();
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshBadges();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshBadges]);

  // Changement de route : refresh throttlé (max 1×/15s) pour refléter un
  // statut modifié sans relancer 9 requêtes à chaque clic.
  useEffect(() => {
    refreshBadges();
  }, [pathname, refreshBadges]);

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
  // IMPORTANT (mobile) : on utilise `delay` plutôt que `distance` pour que
  // le PointerSensor ne capture pas les taps courts. Sur iOS/Android, un
  // simple tap sur un Link déclenchait sinon le sensor (qui attend 6px de
  // mouvement avant relâche), nécessitant un 2e tap. Avec `delay: 200ms`,
  // le drag ne s'enclenche que si l'utilisateur maintient l'appui — un tap
  // rapide passe directement au Link (comportement iOS "hold to drag").
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
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

  // NAV_ITEMS ordonnes selon navOrder (custom de l'utilisateur), puis filtres
  // par permission : on masque les rubriques que le role courant ne peut pas
  // voir (Finance, Facturation, Parametrage). Tant que le role n'est pas
  // charge, on cache les rubriques gatees (evite un flash pour les non-admins).
  const role = me?.role ?? null;
  const orderedNavItems = navOrder
    .map((href) => NAV_ITEMS.find((i) => i.href === href))
    .filter((i): i is NavItem => i !== undefined)
    .filter((item) => {
      // Externe : pas de dashboard d'accueil financier
      if (item.href === "/" && role === "externe") return false;
      const perm = NAV_PERMISSION[item.href];
      if (!perm) return true;
      return perms.has(perm);
    });

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
      {/* Logo : favicon MOON + wordmark "MoonCRM" en mode etendu (identique a
          l'accueil), favicon seul en mode replie. Hauteur h-12 alignee sur le
          bandeau du main content (app-shell) pour que les 2 borders bas
          s'alignent au pixel pres. */}
      <div className={cn("h-12 flex items-center border-b border-white/[0.10] shrink-0", showCollapsed ? "justify-center px-2" : "px-4")}>
        <Link href="/" className="flex items-center gap-2 group min-w-0" title="Retour au dashboard">
          <Image
            src="/moon-icon.svg"
            alt="MoonCRM"
            width={28}
            height={28}
            className="h-7 w-7 opacity-95 group-hover:opacity-100 transition-opacity shrink-0"
            priority
          />
          {!showCollapsed && (
            <span className="font-display text-lg font-semibold tracking-tight text-white/95 group-hover:text-white transition-colors truncate">
              MoonCRM
            </span>
          )}
        </Link>
      </div>

      {/* Nav. DndContext + SortableContext rendent chaque rubrique
          deplacable a la souris / clavier. L'ordre est persiste dans
          localStorage.
          IMPORTANT (mobile) : on desactive completement dnd-kit sur mobile.
          - Pas d'usage : on ne reorganise pas des rubriques au doigt.
          - Bug : sur iOS/Android, meme un sensor avec un drag handle separe peut
            interferer subtilement avec le tap natif (focus, touch-action, hover
            simule, click delay). Sans DndContext, les <li> sont 100% inertes
            -> tap natif OK, navigation immediate. */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
        <ConditionalDndWrapper enabled={!isMobile} sensors={dndSensors} navOrder={navOrder} onDragEnd={onDragEnd}>
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
            // Mobile : <li> simple, pas de useSortable -> aucun listener pointer.
            // Desktop : SortableNavItem avec drag handle visible au hover.
            const NavWrap = isMobile ? PlainNavItem : SortableNavItem;

            return (
              <NavWrap key={item.href} id={item.href} animate={hydrated} className="relative group/item">
                <div
                  onMouseEnter={(e) => {
                    if (!showCollapsed) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setFlyout({ item, top: r.top, left: r.right + 8 });
                  }}
                  onMouseLeave={() => {
                    if (showCollapsed) setFlyout((f) => (f?.item.href === item.href ? null : f));
                  }}
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
                      // h-11 mobile (44px = cible tactile iOS HIG), h-8 desktop
                      showCollapsed ? "h-9 w-9 justify-center mx-auto" : "h-11 md:h-8 px-2",
                      !active && "hover:text-zinc-100 hover:bg-white/[0.05]"
                    )}
                    title={showCollapsed ? item.label : undefined}
                  >
                    <Icon className={cn("shrink-0", showCollapsed ? "h-[18px] w-[18px]" : "h-4 w-4")} />
                    {!showCollapsed && <span className="truncate flex-1">{item.label}</span>}
                    {/* Badge "A faire" : rouge avec count, visible des qu'il y en a au moins 1 */}
                    {item.badgeKey && badges[item.badgeKey] > 0 && (
                      showCollapsed ? (
                        // Mode collapse : pastille pleine, sans count
                        <span
                          aria-label={`${badges[item.badgeKey]} à faire`}
                          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[hsl(var(--sidebar))]"
                        />
                      ) : (
                        <span
                          aria-label={`${badges[item.badgeKey]} à faire`}
                          className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-rose-500/90 text-white text-[10px] font-semibold tabular-nums leading-none"
                        >
                          {badges[item.badgeKey] > 99 ? "99+" : badges[item.badgeKey]}
                        </span>
                      )
                    )}
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

                {/* Le tooltip/flyout en mode replié est rendu en portail
                    `fixed` (cf. flyout state + bloc en fin de composant) pour
                    échapper au clip overflow du <nav> scrollable. */}

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
                              // Mobile : padding plus ample pour zone tactile
                              "block pl-6 pr-2.5 py-2.5 md:py-1.5 rounded-md text-xs md:text-[11.5px] transition-colors truncate",
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
              </NavWrap>
            );
          })}
        </ul>
        </ConditionalDndWrapper>
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
              {me ? ROLE_LABELS[me.role] : "MOON Expertise"}
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

    {/* Flyout mode replié, rendu en portail fixed sur <body> pour échapper
        au clip overflow du <nav>. Affiche le label de l'item + le sous-menu
        Production complet quand on survole une icône en sidebar repliée. */}
    {flyout && typeof document !== "undefined" &&
      createPortal(
        <div
          className="pointer-events-none fixed z-popover"
          style={{ top: flyout.top, left: flyout.left }}
        >
          <div className="animate-fade-in bg-[hsl(var(--surface-elevated))] border border-white/10 text-zinc-100 text-xs px-2.5 py-1.5 rounded-md shadow-pop whitespace-nowrap">
            {flyout.item.label}
            {flyout.item.href === "/obligations" && flyout.item.children && (
              <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1 max-h-80 overflow-auto">
                {flyout.item.children.map((c, i) =>
                  c.kind === "header" ? (
                    <div
                      key={`h-${i}`}
                      className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold pt-1.5 first:pt-0"
                    >
                      {c.label}
                    </div>
                  ) : (
                    <div key={c.slug} className="text-zinc-300 text-[11px] pl-1.5">
                      {c.label}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
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

/**
 * Version inerte de SortableNavItem pour mobile : juste un <li>, aucun appel
 * a useSortable, pas de drag handle. Signature identique pour pouvoir etre
 * substitue dynamiquement (cf. `const NavWrap = isMobile ? PlainNavItem : SortableNavItem`).
 */
function PlainNavItem({
  children,
  className,
}: {
  id: string; // ignore - signature compat
  animate: boolean; // ignore - signature compat
  children: React.ReactNode;
  className?: string;
}) {
  return <li className={className}>{children}</li>;
}

/**
 * Wrapper conditionnel : applique DndContext + SortableContext UNIQUEMENT
 * sur desktop. Sur mobile, retourne juste les children sans aucun provider
 * dnd-kit -> impossible que les sensors / listeners interferent avec le tap
 * natif des Links. Resoud le bug "double tap pour naviguer" sur iOS/Android.
 */
function ConditionalDndWrapper({
  enabled,
  sensors,
  navOrder,
  onDragEnd,
  children,
}: {
  enabled: boolean;
  sensors: ReturnType<typeof useSensors>;
  navOrder: string[];
  onDragEnd: (event: DragEndEvent) => void;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <DndContext id="sidebar-nav-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={navOrder} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  );
}
