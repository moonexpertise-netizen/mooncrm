import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  cn,
  fmtEuro,
  PIPELINE_COLORS,
  STATUT_COLORS,
} from "@/lib/utils";
import PipelinePicker from "./pipeline-picker";
import YearSwitcher from "./year-switcher";
import EcheancierCard from "./echeancier-card";
import DeleteClientButton from "./delete-button";
import LDMButton from "./ldm-button";
import SignatureButton from "./signature-button";
import TallyButton from "./tally-button";
import AnnuaireButton from "./annuaire-button";
import ObligationsMatrix, { type Sub as MatrixSub, type YearConfig as MatrixYC } from "./obligations-matrix";
import ContactsCard, { type ContactRow } from "./contacts-card";
import FicheTabs from "./fiche-tabs";
import NavButtons from "./nav-buttons";
import {
  EditableContactCivilite,
  EditableContactText,
  EditableDate,
  EditableGroupe,
  EditableHeading,
  EditableNumber,
  EditableSelect,
  EditableText,
} from "./editable";
import { ClotureSplit, EditableTextArea } from "./editable-extras";
import { PappersInpiBadges } from "@/lib/pappers-badges";
import type { PipelineStatut, Regime, TypeObligation } from "./actions";

export const dynamic = "force-dynamic";

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

const STATUT_LABEL: Record<StatutLogique, string> = {
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  NON_APPLICABLE: "N/A",
};

const ONBOARDING_LABEL: Record<string, string> = {
  tally_crea_pdc: "Tally Créa / PDC",
  abo_moon: "Abo MOON",
  mandat_moon: "Mandat MOON",
  mandat_impots: "Mandat Impôts",
  impot_gouv: "Impot.gouv",
  cfe_1447: "CFE 1447",
  acces_pennylane: "Accès Pennylane",
  ob_pennylane: "OB Pennylane",
  depot_kbis_banque: "Dépôt KBIS Banque",
  confrere: "Confrère",
  reprise_compta: "Reprise compta",
  affiliation_tns: "Affiliation TNS",
  option_ir_is: "Lettre d'option IR/IS",
  previ_tns: "Prévi TNS",
};

const CAT_LABEL: Record<string, string> = {
  "2G": "Admin général",
  "2C": "Création",
  "2R": "Reprise",
  "2T": "TNS",
};

const FORME_VALUES = [
  "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
  "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
] as const;

const ACTIVITE_VALUES = [
  "AGENCE WEB", "AGENT IMMOBILIER", "AGRICULTURE", "ARCHITECTE", "ARTISAN",
  "ASSOCIATION", "AUDIOVISUEL", "AVOCAT", "AVOCAT FISCAL", "BIEN-ETRE",
  "BOULANGERIE", "BTP", "COACHING SPORTIF", "COIFFURE", "COMMERCE",
  "COMMUNICATION", "CONSEIL EN GESTION", "CONSULTANT", "CRYPTO", "DENTISTE",
  "DESIGN", "E-COMMERCE", "ENERGIES", "ESTHETIQUE", "EXPERTISE COMPTABLE",
  "FORMATION", "HOLDING", "IMMOBILIER", "IMPORT-EXPORT", "INFIRMIER",
  "INFLUENCEUR", "INFORMATIQUE", "INVESTISSEMENT", "KINESITHERAPEUTE",
  "LMNP", "LOCATION MEUBLEE", "MARKETING", "MEDICAL", "NOTAIRE", "PARAMEDICAL",
  "PHOTOGRAPHE", "PROFESSIONNEL LIBERAL", "PSYCHOLOGUE", "RESTAURATION",
  "SANTE", "STARTUP", "TRADUCTION", "TRANSPORT",
  "AUTRE",
] as const;

const ORIGINE_VALUES = [
  "1 - Création",
  "2 - Création par Tiers",
  "3 - Reprise",
  "4 - Reprise sans EC",
  "Z - Sous-traitance",
] as const;

const CURRENT_YEAR = 2026;

export default async function ClientFiche({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    year?: string;
    tab?: string;
    "nav-q"?: string;
    "nav-pipeline"?: string;
    "nav-forme"?: string;
    "nav-origine"?: string;
  }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const activeTab: "identite" | "exercice" | "obligations" | "onboarding" =
    sp.tab === "exercice"
      ? "exercice"
      : sp.tab === "obligations"
      ? "obligations"
      : sp.tab === "onboarding"
      ? "onboarding"
      : "identite";
  const supabase = await createClient();

  // Perf : on charge en parallèle exactement ce qu'il faut, et on évite les
  // gros payloads. Le SELECT * sur clients chargeait ~80 colonnes alors qu'on
  // en utilise ~30. La query "tous les clients" qui servait à prev/next
  // navigation a une shape conditionnelle (cf. ci-dessous) — minimale si pas
  // de filtre nav. On charge aussi status_options pour TOUS les types possibles
  // (~20 lignes, payload minuscule) pour éviter une 2e query séquentielle.

  const navQ = sp["nav-q"]?.toLowerCase() ?? "";
  const navPipeline = new Set(sp["nav-pipeline"]?.split("|").filter(Boolean) ?? []);
  const navForme = new Set(sp["nav-forme"]?.split("|").filter(Boolean) ?? []);
  const navOrigine = new Set(sp["nav-origine"]?.split("|").filter(Boolean) ?? []);
  const hasNavFilter =
    navQ !== "" || navPipeline.size > 0 || navForme.size > 0 || navOrigine.size > 0;

  const [
    { data: client },
    { data: contactsLink },
    { data: onboarding },
    { data: allSubs },
    { data: yearConfigs },
    { data: allGroupes },
    { data: allClientsList },
    { data: allStatusOpts },
  ] = await Promise.all([
    // Colonnes ciblées au lieu de SELECT * : payload divisé par ~2.5.
    supabase
      .from("clients")
      .select(
        "id, denomination, siren, forme, activite, regime, pipeline_statut, mrr, arr, email, fin_mission_date, adresse_siege, code_postal, ville, jour_cloture, mois_cloture, debut_obligations, mois_signature, origine, honoraires_compta, type_honos_bilans, forfait_bilan, type_honos_jur, honoraires_jur, tdb_periode, tdb_honos_periode, forfait_pilotage, type_honos_creation, honoraires_creation, type_honos_reprise, honoraires_reprise, exceptionnel, note_pdc, ldm_social, groupes(nom)"
      )
      .eq("id", id)
      .single(),
    supabase
      .from("client_contacts")
      .select("role, contacts(id, nom, prenom, email, telephone, civilite)")
      .eq("client_id", id),
    supabase
      .from("onboarding_tasks")
      .select("task_key, categorie, statut_logique, statut_detail")
      .eq("client_id", id),
    supabase
      .from("obligation_subscriptions")
      .select("type, annee, actif")
      .eq("client_id", id),
    supabase
      .from("client_year_config")
      .select("annee, regime")
      .eq("client_id", id),
    supabase.from("groupes").select("nom").order("nom"),
    // Liste prev/next : on ne la charge QUE si filtre actif (sinon on n'utilise
    // que id+denomination dans la barre, ce qui est rapide) ; sinon ne fait
    // rien et économise 1 RTT.
    hasNavFilter
      ? supabase
          .from("clients")
          .select("id, denomination, pipeline_statut, forme, origine, groupes(nom)")
          .order("denomination")
      : supabase.from("clients").select("id, denomination").order("denomination"),
    // Status options pour TOUS les types possibles (payload ~20 lignes minuscule).
    // Évite une 2e query séquentielle après obligations pour charger les couleurs.
    supabase
      .from("status_options")
      .select("type_code, libelle, color")
      .eq("scope", "obligation"),
  ]);

  if (!client) notFound();

  const groupeNom = (client.groupes as unknown as { nom: string } | null)?.nom ?? null;

  // Dirigeant principal = 1er contact rattaché. Affiché directement dans
  // "Infos de base" pour avoir Civilité / Prénom / Nom à portée. La carte Contacts
  // en bas permet la gestion multi-contacts.
  const dirigeantContact = (contactsLink?.[0]?.contacts as unknown as {
    id: string;
    nom: string;
    prenom: string | null;
    civilite: "M." | "Mme" | "Mlle" | null;
    email: string | null;
    telephone: string | null;
  } | null) ?? null;

  const yearsSet = new Set<number>((allSubs ?? []).map((s) => s.annee));
  yearsSet.add(CURRENT_YEAR);
  const years = [...yearsSet].sort((a, b) => b - a);
  const selectedYear = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;

  const activeTypes = (allSubs ?? [])
    .filter((s) => s.annee === selectedYear && s.actif)
    .map((s) => s.type as TypeObligation);

  const yearConfig = (yearConfigs ?? []).find((c) => c.annee === selectedYear);
  const regimeYear: Regime | null =
    (yearConfig?.regime as Regime | null) ?? (client.regime as Regime | null) ?? null;

  const { data: obligations } = await supabase
    .from("obligations")
    .select("type, periode, annee, echeance, statut_logique, statut_detail, note, obligation_subscriptions!inner(actif)")
    .eq("client_id", id)
    .eq("annee", selectedYear)
    .eq("obligation_subscriptions.actif", true)
    .order("echeance", { ascending: true, nullsFirst: false })
    .order("type")
    .order("periode");

  // Couleurs custom des libellés (status_options.color) — déjà chargées dans
  // le Promise.all initial (`allStatusOpts`), pas de RTT supplémentaire.
  const colorByKey = new Map<string, string | null>();
  for (const o of allStatusOpts ?? []) {
    if (o.color) colorByKey.set(`${o.type_code}|${o.libelle}`, o.color);
  }

  const onboardingByCat = groupBy(
    (onboarding ?? []) as Array<{
      task_key: string;
      categorie: string;
      statut_logique: StatutLogique;
      statut_detail: string | null;
    }>,
    (t) => t.categorie
  );

  type OblRow = {
    type: string;
    periode: string;
    annee: number;
    echeance: string | null;
    statut_logique: StatutLogique;
    statut_detail: string | null;
    note: string | null;
    color?: string | null;
  };
  const obligationsSorted: OblRow[] = (obligations ?? []).map((o) => ({
    type: o.type,
    periode: o.periode,
    annee: o.annee,
    echeance: o.echeance,
    statut_logique: o.statut_logique as StatutLogique,
    statut_detail: o.statut_detail,
    note: o.note,
    color: o.statut_detail ? colorByKey.get(`${o.type}|${o.statut_detail}`) ?? null : null,
  }));

  const groupesOptions = (allGroupes ?? []).map((g) => g.nom);

  // Navigation prev/next : respecte le filtre actif sur /clients. La liste
  // chargée a la bonne shape (enrichie si filtre actif, minimale sinon) — un
  // seul RTT au lieu de deux.
  let clientList: Array<{ id: string; denomination: string }>;
  if (hasNavFilter) {
    clientList = ((allClientsList ?? []) as unknown as Array<{
      id: string;
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
      .map((c) => ({ id: c.id, denomination: c.denomination }));
  } else {
    clientList = (allClientsList ?? []) as Array<{ id: string; denomination: string }>;
  }

  const idx = clientList.findIndex((c) => c.id === id);
  const prev = idx > 0 ? clientList[idx - 1] : null;
  const next = idx >= 0 && idx < clientList.length - 1 ? clientList[idx + 1] : null;

  function buildHref(targetId: string): string {
    const params = new URLSearchParams();
    if (activeTab === "exercice") {
      params.set("tab", "exercice");
      params.set("year", String(selectedYear));
    } else if (activeTab === "obligations") {
      params.set("tab", "obligations");
    } else if (activeTab === "onboarding") {
      params.set("tab", "onboarding");
    }
    if (sp["nav-q"]) params.set("nav-q", sp["nav-q"]);
    if (sp["nav-pipeline"]) params.set("nav-pipeline", sp["nav-pipeline"]);
    if (sp["nav-forme"]) params.set("nav-forme", sp["nav-forme"]);
    if (sp["nav-origine"]) params.set("nav-origine", sp["nav-origine"]);
    const qs = params.toString();
    return `/clients/${targetId}${qs ? `?${qs}` : ""}`;
  }

  // Clôture sous la forme "JJ/MM" pour affichage
  const cloture =
    client.jour_cloture && client.mois_cloture
      ? `${String(client.jour_cloture).padStart(2, "0")}/${String(
          client.mois_cloture
        ).padStart(2, "0")}`
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href="/clients" className="text-muted-foreground hover:text-[hsl(var(--gold))] transition-colors">
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
            if (sp["nav-q"]) p.set("nav-q", sp["nav-q"]);
            if (sp["nav-pipeline"]) p.set("nav-pipeline", sp["nav-pipeline"]);
            if (sp["nav-forme"]) p.set("nav-forme", sp["nav-forme"]);
            if (sp["nav-origine"]) p.set("nav-origine", sp["nav-origine"]);
            return p.toString();
          })()}
        />
      </div>

      {/* HEADER */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <EditableHeading clientId={id} value={client.denomination} />
              <PappersInpiBadges siren={client.siren} />
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              {client.siren && <span>SIREN {client.siren}</span>}
              {client.forme && <span>· {client.forme}</span>}
              {client.activite && <span>· {client.activite}</span>}
              {groupeNom && <span>· Groupe {groupeNom}</span>}
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {client.pipeline_statut && (
                <Badge
                  text={client.pipeline_statut}
                  color={PIPELINE_COLORS[client.pipeline_statut]}
                />
              )}
              {regimeYear && <Badge text={`Régime ${regimeYear} (${selectedYear})`} />}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">MRR</div>
              <div className="text-2xl font-semibold">{fmtEuro(client.mrr)}</div>
              <div className="text-xs text-muted-foreground">
                ARR {fmtEuro(client.arr ?? (client.mrr ?? 0) * 12)}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <AnnuaireButton
                clientId={id}
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
                clientId={id}
                email={client.email}
                denomination={client.denomination}
                siren={client.siren}
                origine={client.origine}
              />
              <LDMButton
                clientId={id}
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
                clientId={id}
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
              <DeleteClientButton clientId={id} denomination={client.denomination} />
            </div>
          </div>
        </div>
      </div>

      {/* TABS — switch client-side instantané */}
      <FicheTabs
        clientId={id}
        defaultTab={activeTab}
        selectedYear={selectedYear}
        identite={
          <div className="space-y-6 mt-6">
      <Card title="Pipeline">
        <PipelinePicker
          clientId={id}
          current={(client.pipeline_statut as PipelineStatut | null) ?? null}
        />
      </Card>

      {/* ====================================================================
          SECTION 1 — INFOS DE BASE (identique au parcours de création)
      ==================================================================== */}
      <SectionTitle
        n={1}
        title="Infos de base"
        sub="Identité du dossier et coordonnées · alimentent la lettre de mission"
      />
      <Card title="Identité du dossier">
        {/* Dirigeant principal (1er contact rattaché) — édition inline directe.
            La carte Contacts plus bas reste pour la gestion multi-contacts. */}
        {dirigeantContact ? (
          <>
            <EditableContactCivilite
              contactId={dirigeantContact.id}
              value={dirigeantContact.civilite}
              label="Civilité dirigeant"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="prenom"
              value={dirigeantContact.prenom}
              label="Prénom dirigeant"
            />
            <EditableContactText
              contactId={dirigeantContact.id}
              field="nom"
              value={dirigeantContact.nom}
              label="Nom dirigeant"
              required
            />
          </>
        ) : (
          <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm items-center">
            <div className="text-muted-foreground">Dirigeant</div>
            <div className="px-2 py-1 -mx-2 rounded bg-amber-50 text-amber-700 text-xs">
              Aucun contact rattaché · ajouter un contact dans la carte Contacts ↓
            </div>
          </div>
        )}
        <EditableText
          clientId={id}
          field="email"
          value={client.email}
          label="Adresse mail"
        />
        <EditableText
          clientId={id}
          field="activite"
          value={client.activite}
          label="Activité"
        />
        <EditableDate
          clientId={id}
          field="fin_mission_date"
          value={client.fin_mission_date}
          label="Clôture 1ère mission"
        />
        <EditableText
          clientId={id}
          field="adresse_siege"
          value={client.adresse_siege}
          label="Adresse ligne 1"
        />
        <EditableText
          clientId={id}
          field="code_postal"
          value={client.code_postal}
          label="Code postal"
        />
        <EditableText
          clientId={id}
          field="ville"
          value={client.ville}
          label="Ville"
        />
      </Card>

      {/* ====================================================================
          SECTION 2 — HONORAIRES (forfaits récurrents + one-shots)
      ==================================================================== */}
      <SectionTitle
        n={2}
        title="Honoraires"
        sub="Forfaits qui alimentent la lettre de mission"
      />
      <Card title="Forfaits récurrents">
        <EditableNumber
          clientId={id}
          field="honoraires_compta"
          value={client.honoraires_compta}
          label="Forfait comptable"
          unit="eur"
        />
        <div className="border-t pt-2 mt-1">
          <EditableSelect
            clientId={id}
            field="type_honos_bilans"
            value={client.type_honos_bilans}
            label="Forfait bilan"
            options={["Facturés", "Inclus"]}
          />
          {client.type_honos_bilans === "Facturés" && (
            <EditableNumber
              clientId={id}
              field="forfait_bilan"
              value={client.forfait_bilan}
              label="↳ Montant"
              unit="eur"
            />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect
            clientId={id}
            field="type_honos_jur"
            value={client.type_honos_jur}
            label="Forfait juridique"
            options={["Facturés", "Inclus", "Non souscrit"]}
          />
          {client.type_honos_jur === "Facturés" && (
            <EditableNumber
              clientId={id}
              field="honoraires_jur"
              value={client.honoraires_jur}
              label="↳ Montant"
              unit="eur"
            />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect
            clientId={id}
            field="tdb_periode"
            value={client.tdb_periode}
            label="Forfait pilotage"
            options={["Mensuel", "Trimestriel", "Non souscrit"]}
          />
          {(client.tdb_periode === "Mensuel" || client.tdb_periode === "Trimestriel") && (
            <>
              <EditableNumber
                clientId={id}
                field="tdb_honos_periode"
                value={client.tdb_honos_periode}
                label={`↳ Montant / ${client.tdb_periode === "Mensuel" ? "mois" : "trimestre"}`}
                unit="eur"
              />
              <FieldReadonly
                label="↳ Équivalent mensuel"
                value={fmtEuro(client.forfait_pilotage ?? 0) ?? "·"}
              />
            </>
          )}
        </div>
        <div className="border-t pt-2 mt-2 space-y-0.5">
          <FieldReadonly label="MRR" value={fmtEuro(client.mrr ?? 0) ?? "·"} />
          <FieldReadonly label="ARR" value={fmtEuro(client.arr ?? 0) ?? "·"} />
        </div>
      </Card>

      <Card title="Honoraires one-shot">
        <div>
          <EditableSelect
            clientId={id}
            field="type_honos_creation"
            value={client.type_honos_creation}
            label="Forfait création"
            options={["Facturés", "Non souscrit"]}
          />
          {client.type_honos_creation === "Facturés" && (
            <EditableNumber
              clientId={id}
              field="honoraires_creation"
              value={client.honoraires_creation}
              label="↳ Montant"
              unit="eur"
            />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableSelect
            clientId={id}
            field="type_honos_reprise"
            value={client.type_honos_reprise}
            label="Forfait reprise"
            options={["Facturés", "Non souscrit"]}
          />
          {client.type_honos_reprise === "Facturés" && (
            <EditableNumber
              clientId={id}
              field="honoraires_reprise"
              value={client.honoraires_reprise}
              label="↳ Montant"
              unit="eur"
            />
          )}
        </div>
        <div className="border-t pt-2 mt-1">
          <EditableNumber
            clientId={id}
            field="exceptionnel"
            value={client.exceptionnel}
            label="Honos exceptionnels"
            unit="eur"
          />
        </div>
      </Card>

      {/* ====================================================================
          SECTION 3 — DÉTAILS CRM (suivi interne, pas dans la LDM)
      ==================================================================== */}
      <SectionTitle
        n={3}
        title="Détails CRM"
        sub="Suivi interne · n'apparaît pas dans la lettre de mission"
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Identité légale">
          <EditableText clientId={id} field="siren" value={client.siren} label="SIREN" />
          <EditableSelect
            clientId={id}
            field="forme"
            value={client.forme}
            label="Forme juridique"
            options={FORME_VALUES}
          />
          <EditableSelect
            clientId={id}
            field="origine"
            value={client.origine}
            label="Origine"
            options={ORIGINE_VALUES}
          />
          <EditableGroupe
            clientId={id}
            value={groupeNom}
            label="Groupe"
            options={groupesOptions}
          />
        </Card>

        <Card title="Dates de gestion">
          <ClotureSplit
            clientId={id}
            jour={client.jour_cloture}
            mois={client.mois_cloture}
          />
          <EditableDate
            clientId={id}
            field="debut_obligations"
            value={client.debut_obligations}
            label="Reprise à partir de"
          />
          <EditableDate
            clientId={id}
            field="mois_signature"
            value={client.mois_signature}
            label="Mois signature"
          />
        </Card>
      </div>

      <Card title="Notes">
        <EditableTextArea
          clientId={id}
          field="note_pdc"
          value={client.note_pdc}
          label="Note PDC"
        />
        <EditableTextArea
          clientId={id}
          field="ldm_social"
          value={client.ldm_social}
          label="LDM social"
        />
      </Card>

      <ContactsCard
        clientId={id}
        contacts={(contactsLink ?? []).map((cc) => {
          const c = cc.contacts as unknown as {
            id: string;
            nom: string;
            prenom: string | null;
            email: string | null;
            telephone: string | null;
            civilite: "M." | "Mme" | "Mlle" | null;
          } | null;
          return c
            ? {
                contactId: c.id,
                nom: c.nom,
                prenom: c.prenom,
                email: c.email,
                telephone: c.telephone,
                civilite: c.civilite,
                role: cc.role ?? null,
              }
            : null;
        }).filter(Boolean) as ContactRow[]}
      />
          </div>
        }
        exercice={
          <div className="space-y-6 mt-6">
      <YearSwitcher years={years} selected={selectedYear} clientId={id} />

      <EcheancierCard
        clientId={id}
        annee={selectedYear}
        items={obligationsSorted}
        hasActiveSubs={activeTypes.length > 0}
      />
          </div>
        }
        obligations={(() => {
        // Année min/max parmi les subs + courante + suivante
        const subYears = new Set<number>((allSubs ?? []).map((s) => s.annee));
        subYears.add(CURRENT_YEAR);
        subYears.add(CURRENT_YEAR + 1);
        const yearsList = [...subYears].sort((a, b) => a - b);
        const matrixSubs: MatrixSub[] = (allSubs ?? []).map((s) => ({
          type: s.type, annee: s.annee, actif: !!s.actif,
        }));
        const matrixYC: MatrixYC[] = (yearConfigs ?? []).map((c) => ({
          annee: c.annee, regime: (c.regime as "IR" | "IS" | null) ?? null,
        }));
        return (
          <ObligationsMatrix
            clientId={id}
            subs={matrixSubs}
            yearConfigs={matrixYC}
            years={yearsList}
            debutObligations={client.debut_obligations}
          />
        );
      })()}

        onboarding={
          <div className="mt-6">
            <Card title={`Onboarding (${onboarding?.length ?? 0} tâche${(onboarding?.length ?? 0) > 1 ? "s" : ""})`}>
              {!onboarding?.length ? (
                <p className="text-sm text-muted-foreground">Aucune tâche d&apos;onboarding renseignée.</p>
              ) : (
                <div className="space-y-4">
                  {(["2G", "2C", "2R", "2T"] as const).map((cat) => {
                    const tasks = onboardingByCat[cat];
                    if (!tasks?.length) return null;
                    return (
                      <div key={cat}>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                          {CAT_LABEL[cat]}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {tasks.map((t, i) => (
                            <div
                              key={i}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-white text-sm"
                            >
                              <div className="font-medium">
                                {ONBOARDING_LABEL[t.task_key] ?? t.task_key}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {t.statut_detail}
                                </span>
                                <span
                                  className={cn(
                                    "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border",
                                    STATUT_COLORS[t.statut_logique]
                                  )}
                                >
                                  {STATUT_LABEL[t.statut_logique]}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        }
      />
    </div>
  );
}

function Tabs({
  activeTab,
  clientId,
  selectedYear,
}: {
  activeTab: "identite" | "exercice" | "obligations" | "onboarding";
  clientId: string;
  selectedYear: number;
}) {
  const tabs: Array<{ key: typeof activeTab; label: string; href: string }> = [
    { key: "identite", label: "Identité", href: `/clients/${clientId}` },
    { key: "exercice", label: "Échéances", href: `/clients/${clientId}?tab=exercice&year=${selectedYear}` },
    { key: "obligations", label: "Obligations", href: `/clients/${clientId}?tab=obligations` },
    { key: "onboarding", label: "Onboarding", href: `/clients/${clientId}?tab=onboarding` },
  ];
  return (
    <div className="border-b flex gap-1">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={cn(
            "px-4 py-2 text-sm border-b-2 -mb-px transition-colors",
            t.key === activeTab
              ? "border-[hsl(var(--gold))] text-[hsl(var(--gold-dark))] font-medium"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function groupBy<T, K extends string | number>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = key(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium mb-3 text-zinc-700">{title}</h3>
      {children}
    </div>
  );
}

/** Séparateur de section · titre numéroté + sous-titre, ligne dorée.
 *  Identique au composant utilisé dans le form de création (cohérence visuelle). */
function SectionTitle({
  n,
  title,
  sub,
}: {
  n: number;
  title: string;
  sub: string;
}) {
  return (
    <div className="pt-2 pb-1">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-xs font-semibold">
          {n}
        </span>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900">
          {title}
        </h2>
      </div>
      <p className="text-[11px] text-zinc-500 ml-8 mt-0.5">{sub}</p>
      <div className="h-px bg-zinc-200 mt-2" />
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2">
      <div className="flex items-baseline gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="mt-2 h-px bg-zinc-200" />
    </div>
  );
}

/**
 * Champ en lecture seule (valeur calculée : MRR, ARR, équivalent mensuel…).
 * Visuellement distinct des champs saisissables : fond gris pastel + bordure
 * grise, texte gris moyen. Pas de hover (non cliquable).
 */
function FieldReadonly({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,360px)] gap-2 py-1 text-sm items-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="px-2 py-1 -mx-2 rounded border border-zinc-200 bg-zinc-50 text-zinc-600 tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span
      className={cn(
        "inline-block px-2 py-0.5 rounded-full text-xs font-medium border",
        color ?? "bg-zinc-100 text-zinc-700 border-zinc-200"
      )}
    >
      {text}
    </span>
  );
}

