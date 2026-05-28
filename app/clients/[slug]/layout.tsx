import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import { EditableHeading } from "./editable";
import { Badge } from "./_components";
import AnnuaireButton from "./annuaire-button";
import BackButton from "./back-button";
import DeleteClientButton from "./delete-button";
import LDMButton from "./ldm-button";
import LDMSigneeButton from "./ldm-signee-button";
import NavButtons from "./nav-buttons";
import SignatureButton from "./signature-button";
import TallyButton from "./tally-button";
import FicheTabs from "./fiche-tabs";
import { loadClient, loadContactsLink, extractDirigeant } from "./_data";
import type { PipelineStatut } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Calcule l'URL et le label du bouton retour de la fiche client.
 *
 * Priorite :
 *   1. ?from=<url-encoded> dans l'URL courante (inject par les listes)
 *   2. Referer (best-effort, fonctionne si on vient d'une page interne)
 *   3. Fallback /clients
 *
 * Le label est deduit du chemin :
 *   - /onboarding         -> "Onboarding"
 *   - /onboarding/matrice -> "Matrice onboarding"
 *   - /pipeline           -> "Pipeline"
 *   - /clients            -> "Clients"
 *   - /                   -> "Dashboard"
 *   - autre               -> "Retour"
 *
 * Le `from` complet (avec query string) est preserve pour ne PAS perdre
 * les filtres et tri appliques avant clic sur le dossier.
 */
function computeBackHref(
  fromParam: string | undefined,
  referer: string
): { href: string; label: string } {
  // 1. fromParam prioritaire (decode + check qu'il s'agit d'une route interne)
  if (fromParam) {
    try {
      const decoded = decodeURIComponent(fromParam);
      if (decoded.startsWith("/")) {
        return { href: decoded, label: labelFromPath(decoded) };
      }
    } catch {
      // ignore decode error
    }
  }
  // 2. Referer (extraire pathname + search)
  if (referer) {
    try {
      const u = new URL(referer);
      // Eviter de rester sur la fiche client elle-meme (sous-route inter)
      // et eviter de remonter sur une autre fiche client.
      if (!u.pathname.startsWith("/clients/") || u.pathname === "/clients") {
        return {
          href: u.pathname + u.search,
          label: labelFromPath(u.pathname),
        };
      }
    } catch {
      // ignore
    }
  }
  return { href: "/clients", label: "Clients" };
}

function labelFromPath(path: string): string {
  if (path === "/" || path.startsWith("/?")) return "Dashboard";
  if (path === "/clients" || path.startsWith("/clients?")) return "Clients";
  if (path.startsWith("/onboarding/matrice")) return "Matrice onboarding";
  if (path.startsWith("/onboarding/parametrage")) return "Paramétrage onboarding";
  if (path === "/onboarding" || path.startsWith("/onboarding?") || path.startsWith("/onboarding/")) return "Onboarding";
  if (path === "/pipeline" || path.startsWith("/pipeline?")) return "Pipeline";
  if (path === "/parametrage" || path.startsWith("/parametrage?")) return "Paramétrage";
  if (path.startsWith("/obligations/")) return "Production";
  if (path === "/obligations" || path.startsWith("/obligations?")) return "Production";
  if (path.startsWith("/missions/ir")) return "IR";
  if (path.startsWith("/missions/caa")) return "CAA";
  return "Retour";
}

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const client = await loadClient(slug);
  if (!client) notFound();
  const contactsLink = await loadContactsLink(client.id);
  const dirigeantContact = extractDirigeant(contactsLink);

  // Navigation prev/next : lecture des nav-* params depuis l'URL via headers().
  // On reconstruit la liste filtrée et l'index de la fiche courante.
  const headersList = await headers();
  const referer = headersList.get("referer") ?? "";
  const url = new URL(referer || "http://localhost/");
  // Fallback back href cote serveur (depuis referer uniquement). Le BackButton
  // client read aussi ?from= dans l'URL courante et override si present.
  const back = computeBackHref(undefined, referer);
  // Note : on ne récupère pas les nav-* depuis les params du layout (Next ne
  // les expose pas), donc on les lit depuis le referer en best-effort. Ce
  // n'est pas critique : si non trouvés, la liste prev/next reste complète.
  // En pratique, NavButtons lit aussi window.location.search en JS pour
  // construire les liens, donc le rendu serveur est OK même sans nav-*.
  const navQ = url.searchParams.get("nav-q")?.toLowerCase() ?? "";
  const navPipeline = new Set(url.searchParams.get("nav-pipeline")?.split("|").filter(Boolean) ?? []);
  const navForme = new Set(url.searchParams.get("nav-forme")?.split("|").filter(Boolean) ?? []);
  const navOrigine = new Set(url.searchParams.get("nav-origine")?.split("|").filter(Boolean) ?? []);
  const hasNavFilter =
    navQ !== "" || navPipeline.size > 0 || navForme.size > 0 || navOrigine.size > 0;

  const supabase = await createClient();
  const { data: allClientsList } = hasNavFilter
    ? await supabase
        .from("clients")
        .select("id, slug, denomination, pipeline_statut, forme, origine, groupes(nom)")
        .order("denomination")
    : await supabase.from("clients").select("id, slug, denomination").order("denomination");

  let clientList: Array<{ slug: string; denomination: string }>;
  if (hasNavFilter) {
    clientList = ((allClientsList ?? []) as unknown as Array<{
      id: string;
      slug: string;
      denomination: string;
      pipeline_statut: string | null;
      forme: string | null;
      origine: string | null;
      groupes: { nom: string } | null;
    }>)
      .filter((c) => {
        if (navQ) {
          const hay = `${c.denomination} ${c.groupes?.nom ?? ""}`.toLowerCase();
          if (!hay.includes(navQ)) return false;
        }
        if (navPipeline.size && !navPipeline.has(c.pipeline_statut ?? "")) return false;
        if (navForme.size && !navForme.has(c.forme ?? "")) return false;
        if (navOrigine.size && !navOrigine.has(c.origine ?? "")) return false;
        return true;
      })
      .map((c) => ({ slug: c.slug, denomination: c.denomination }));
  } else {
    clientList = (allClientsList ?? []) as Array<{ slug: string; denomination: string }>;
  }

  const idx = clientList.findIndex((c) => c.slug === slug);
  const prev = idx > 0 ? clientList[idx - 1] : null;
  const next = idx >= 0 && idx < clientList.length - 1 ? clientList[idx + 1] : null;

  const groupeNom = (client.groupes as unknown as { nom: string } | null)?.nom ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <BackButton defaultHref={back.href} defaultLabel={back.label} />
        <NavButtons
          prev={prev}
          next={next}
          idx={idx}
          total={clientList.length}
          filtered={hasNavFilter}
          navParams={(() => {
            const p = new URLSearchParams();
            const q = url.searchParams.get("nav-q");
            if (q) p.set("nav-q", q);
            const pip = url.searchParams.get("nav-pipeline");
            if (pip) p.set("nav-pipeline", pip);
            const fo = url.searchParams.get("nav-forme");
            if (fo) p.set("nav-forme", fo);
            const og = url.searchParams.get("nav-origine");
            if (og) p.set("nav-origine", og);
            return p.toString();
          })()}
        />
      </div>

      {/* HERO HEADER — Card premium avec gradient subtil + métrique mise en valeur.
          Mobile : tout en colonne. Desktop : titre + meta à gauche, MRR + actions à droite. */}
      <div className="hero-surface rounded-2xl px-5 md:px-6 py-5 md:py-6">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-start lg:justify-between gap-4 lg:gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EditableHeading clientId={client.id} value={client.denomination} />
              <PappersInpiBadges siren={client.siren} />
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mt-2 text-xs sm:text-sm">
              {client.siren && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200/80 text-zinc-600 tabular-nums">
                  SIREN {client.siren}
                </span>
              )}
              {client.forme && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-50 border border-zinc-200/80 text-zinc-600 font-medium">
                  {client.forme}
                </span>
              )}
              {client.activite && (
                <span className="text-zinc-500 ml-1">{client.activite}</span>
              )}
              {groupeNom && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[hsl(var(--gold))]/10 text-[hsl(var(--gold-dark))] dark:text-[hsl(var(--gold))] border border-[hsl(var(--gold))]/15 font-medium">
                  Groupe · {groupeNom}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {client.pipeline_statut && (
                <Badge
                  text={client.pipeline_statut}
                  color={PIPELINE_COLORS[client.pipeline_statut as PipelineStatut]}
                />
              )}
            </div>
          </div>
          {/* Bloc MRR + actions : sur mobile rangé sur une ligne ;
              sur desktop empilé verticalement à droite. */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-start gap-3 w-full lg:w-auto">
            <div className="lg:text-right">
              <div className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold">MRR</div>
              <div className="font-display text-3xl lg:text-4xl font-semibold tracking-tight text-zinc-900 tabular-nums leading-none mt-1">
                {fmtEuro(client.mrr)}
              </div>
              <div className="text-[11px] sm:text-xs text-zinc-500 mt-1.5 tabular-nums">
                ARR <span className="font-medium text-zinc-700">{fmtEuro(client.arr ?? (client.mrr ?? 0) * 12)}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap justify-end">
              <AnnuaireButton
                clientId={client.id}
                siren={client.siren}
                current={{
                  adresse_siege: client.adresse_siege,
                  code_postal: client.code_postal,
                  ville: client.ville,
                  activite: client.activite,
                  forme: client.forme,
                  jour_cloture: client.jour_cloture,
                  mois_cloture: client.mois_cloture,
                  dirigeant: dirigeantContact
                    ? { prenom: dirigeantContact.prenom, nom: dirigeantContact.nom }
                    : null,
                }}
              />
              <TallyButton
                clientId={client.id}
                email={client.email}
                denomination={client.denomination}
                siren={client.siren}
                origine={client.origine}
              />
              <LDMButton
                clientId={client.id}
                dirigeant={
                  dirigeantContact
                    ? {
                        civilite: dirigeantContact.civilite,
                        prenom: dirigeantContact.prenom,
                        nom: dirigeantContact.nom,
                        email: dirigeantContact.email,
                        telephone: dirigeantContact.telephone,
                      }
                    : null
                }
              />
              <SignatureButton
                clientId={client.id}
                denomination={client.denomination}
                finMissionDate={client.fin_mission_date}
                dirigeant={
                  dirigeantContact
                    ? {
                        civilite: dirigeantContact.civilite,
                        prenom: dirigeantContact.prenom,
                        nom: dirigeantContact.nom,
                        email: dirigeantContact.email,
                        telephone: dirigeantContact.telephone,
                      }
                    : null
                }
              />
              <LDMSigneeButton
                clientId={client.id}
                alreadySigned={
                  client.pipeline_statut === "7 - LDM signée" &&
                  !!client.mois_signature
                }
              />
              <DeleteClientButton clientId={client.id} denomination={client.denomination} />
            </div>
          </div>
        </div>
      </div>

      {/* TABS — vrais Link Next vers les sous-routes */}
      <FicheTabs slug={slug} />

      {/* Contenu de l'onglet courant */}
      <div className={cn("mt-6")}>{children}</div>
    </div>
  );
}
