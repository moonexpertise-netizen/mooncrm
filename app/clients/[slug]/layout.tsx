import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { cn, fmtEuro, PIPELINE_COLORS } from "@/lib/utils";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import { EditableHeading } from "./editable";
import { Badge } from "./_components";
import AnnuaireButton from "./annuaire-button";
import DeleteClientButton from "./delete-button";
import LDMButton from "./ldm-button";
import NavButtons from "./nav-buttons";
import SignatureButton from "./signature-button";
import TallyButton from "./tally-button";
import FicheTabs from "./fiche-tabs";
import { loadClient, loadContactsLink, extractDirigeant } from "./_data";
import type { PipelineStatut } from "./actions";

export const dynamic = "force-dynamic";

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
        <Link
          href="/clients"
          className="text-muted-foreground hover:text-[hsl(var(--gold))] transition-colors"
        >
          ← Clients
        </Link>
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

      {/* HEADER — mobile : tout en colonne, MRR et boutons sous le titre.
          Desktop : titre à gauche, MRR + boutons à droite. */}
      <div className="space-y-3">
        <div className="flex flex-col lg:flex-row lg:flex-wrap lg:items-start lg:justify-between gap-3 lg:gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EditableHeading clientId={client.id} value={client.denomination} />
              <PappersInpiBadges siren={client.siren} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs sm:text-sm text-muted-foreground">
              {client.siren && <span>SIREN {client.siren}</span>}
              {client.forme && <span>· {client.forme}</span>}
              {client.activite && <span>· {client.activite}</span>}
              {groupeNom && <span>· Groupe {groupeNom}</span>}
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
              <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">MRR</div>
              <div className="text-xl sm:text-2xl font-semibold">{fmtEuro(client.mrr)}</div>
              <div className="text-[11px] sm:text-xs text-muted-foreground">
                ARR {fmtEuro(client.arr ?? (client.mrr ?? 0) * 12)}
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
