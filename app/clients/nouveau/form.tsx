"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createClientFromSiren } from "./actions";

const FORMES = [
  "ASSO", "SA", "SCI", "EI", "SARL", "SAS", "SELARL", "SELAS",
  "SCM", "SC", "EURL", "SASU", "INDIV", "AARPI", "LMNP",
] as const;
const ACTIVITES = [
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
const ORIGINES = [
  "1 - Création",
  "2 - Création par Tiers",
  "3 - Reprise",
  "4 - Reprise sans EC",
  "Z - Sous-traitance",
] as const;
const PIPELINES = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
  "Z - Interne",
] as const;

// Mapping codes catégorie juridique INSEE -> formes du CRM
const NATURE_TO_FORME: Record<string, (typeof FORMES)[number]> = {
  "5710": "SAS", "5720": "SAS",
  "5498": "SARL", "5499": "SARL", "5485": "SARL",
  "5499 ": "SARL",
  "5505": "EURL", "5430": "EURL",
  "5202": "SASU",
  "1000": "EI", "1100": "EI",
  "5560": "SA", "5599": "SA",
  "5410": "SELARL", "5470": "SELARL",
  "5485 ": "SELAS",
  "6540": "SCI",
  "9220": "ASSO",
};

type Dirigeant = {
  nom?: string | null;
  prenoms?: string | null;
  qualite?: string | null;
  type_dirigeant?: string | null;
};

type Suggestion = {
  siren: string;
  nom_complet: string;
  nom_raison_sociale?: string | null;
  nature_juridique: string | null;
  activite_principale?: string | null;
  dirigeants?: Dirigeant[];
  siege?: {
    code_postal?: string | null;
    libelle_commune?: string | null;
    adresse?: string | null;
    activite_principale?: string | null;
  } | null;
};

/** Met en forme une chaîne en Title Case en respectant les traits d'union. */
function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s|-)/)
    .map((p) => (p.match(/[\s-]/) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

/** Extrait prénom + nom de famille d'un dirigeant (personne physique). */
function extractDirigeantParts(
  d: Dirigeant | undefined | null
): { prenom: string; nom: string } | null {
  if (!d || d.type_dirigeant !== "personne physique") return null;
  const nom = (d.nom ?? "").trim().toUpperCase();
  const prenomBrut = (d.prenoms ?? "").trim().split(/\s+/)[0] ?? "";
  const prenom = prenomBrut ? toTitleCase(prenomBrut) : "";
  if (!nom && !prenom) return null;
  return { prenom, nom };
}

/**
 * Mappe un code NAF/APE vers l'enum `activite`. On essaie d'abord un match
 * spécifique (préfixe NN.NN), puis on retombe sur la division (NN).
 * Renvoie 'AUTRE' si aucune correspondance.
 */
function activiteFromNaf(naf: string | null | undefined): string | null {
  if (!naf) return null;
  const code = naf.toUpperCase().replace(/\s/g, "");
  const prefix4 = code.substring(0, 5); // ex. "69.20"
  const div = code.substring(0, 2);

  // Matches spécifiques (préfixe 4 chars NN.NN)
  const specific: Record<string, string> = {
    "69.20": "EXPERTISE COMPTABLE",
    "69.10": "AVOCAT",
    "70.22": "CONSULTANT",
    "70.21": "COMMUNICATION",
    "74.10": "DESIGN",
    "74.20": "PHOTOGRAPHE",
    "74.30": "TRADUCTION",
    "74.90": "CONSULTANT",
    "73.11": "MARKETING",
    "73.12": "MARKETING",
    "63.11": "INFORMATIQUE",
    "63.12": "INFORMATIQUE",
    "58.21": "INFORMATIQUE",
    "58.29": "INFORMATIQUE",
    "62.01": "INFORMATIQUE",
    "62.02": "INFORMATIQUE",
    "62.03": "INFORMATIQUE",
    "62.09": "INFORMATIQUE",
    "59.11": "AUDIOVISUEL",
    "59.12": "AUDIOVISUEL",
    "59.20": "AUDIOVISUEL",
    "60.10": "AUDIOVISUEL",
    "60.20": "AUDIOVISUEL",
    "47.11": "COMMERCE",
    "47.19": "COMMERCE",
    "47.91": "E-COMMERCE",
    "56.10": "RESTAURATION",
    "56.21": "RESTAURATION",
    "56.30": "RESTAURATION",
    "55.20": "LOCATION MEUBLEE",
    "68.20": "IMMOBILIER",
    "68.31": "AGENT IMMOBILIER",
    "68.32": "IMMOBILIER",
    "10.71": "BOULANGERIE",
    "96.02": "COIFFURE",
    "96.04": "ESTHETIQUE",
    "86.10": "MEDICAL",
    "86.21": "MEDICAL",
    "86.22": "MEDICAL",
    "86.23": "DENTISTE",
    "86.90": "PARAMEDICAL",
    "85.10": "FORMATION",
    "85.20": "FORMATION",
    "85.31": "FORMATION",
    "85.32": "FORMATION",
    "85.41": "FORMATION",
    "85.42": "FORMATION",
    "85.59": "FORMATION",
    "85.60": "FORMATION",
    "41.10": "IMMOBILIER",
    "41.20": "BTP",
    "43.21": "BTP",
    "43.22": "BTP",
    "43.31": "BTP",
    "43.32": "BTP",
    "43.33": "BTP",
    "43.34": "BTP",
    "43.39": "BTP",
    "43.99": "BTP",
    "75.00": "PARAMEDICAL",
    "93.11": "COACHING SPORTIF",
    "93.12": "COACHING SPORTIF",
    "93.13": "COACHING SPORTIF",
    "93.19": "COACHING SPORTIF",
    "94.11": "ASSOCIATION",
    "94.12": "ASSOCIATION",
    "94.99": "ASSOCIATION",
    "64.20": "HOLDING",
    "64.30": "INVESTISSEMENT",
    "64.99": "INVESTISSEMENT",
    "66.30": "INVESTISSEMENT",
    "66.19": "INVESTISSEMENT",
  };
  if (specific[prefix4]) return specific[prefix4];

  // Fallback par division (NN)
  const byDiv: Record<string, string> = {
    "01": "AGRICULTURE", "02": "AGRICULTURE", "03": "AGRICULTURE",
    "10": "COMMERCE", "11": "COMMERCE", "12": "COMMERCE", "13": "COMMERCE", "14": "COMMERCE", "15": "COMMERCE",
    "16": "ARTISAN", "17": "ARTISAN", "18": "ARTISAN",
    "23": "BTP", "24": "BTP", "25": "ARTISAN",
    "26": "INFORMATIQUE", "27": "INFORMATIQUE",
    "35": "ENERGIES", "36": "ENERGIES", "37": "ENERGIES", "38": "ENERGIES", "39": "ENERGIES",
    "41": "BTP", "42": "BTP", "43": "BTP",
    "45": "COMMERCE", "46": "COMMERCE", "47": "COMMERCE",
    "49": "TRANSPORT", "50": "TRANSPORT", "51": "TRANSPORT", "52": "TRANSPORT", "53": "TRANSPORT",
    "55": "RESTAURATION", "56": "RESTAURATION",
    "58": "AUDIOVISUEL", "59": "AUDIOVISUEL", "60": "AUDIOVISUEL",
    "61": "INFORMATIQUE", "62": "INFORMATIQUE", "63": "INFORMATIQUE",
    "64": "INVESTISSEMENT", "65": "INVESTISSEMENT", "66": "INVESTISSEMENT",
    "68": "IMMOBILIER",
    "69": "CONSULTANT",
    "70": "CONSULTANT",
    "71": "ARCHITECTE", "72": "CONSULTANT",
    "73": "MARKETING", "74": "CONSULTANT",
    "77": "COMMERCE", "78": "CONSULTANT", "79": "COMMERCE",
    "85": "FORMATION",
    "86": "MEDICAL", "87": "MEDICAL", "88": "MEDICAL",
    "90": "AUDIOVISUEL", "91": "AUDIOVISUEL", "92": "AUDIOVISUEL", "93": "BIEN-ETRE",
    "94": "ASSOCIATION", "95": "ARTISAN", "96": "BIEN-ETRE",
  };
  return byDiv[div] ?? "AUTRE";
}

/** Classes de fond pour les inputs : ambre si vide, blanc sinon. */
function inputFill(value: string): string {
  return value.trim()
    ? "border-zinc-300 bg-white focus:border-[hsl(var(--gold))]/60"
    : "border-amber-300 bg-amber-50 text-amber-900 placeholder:text-amber-700/60";
}

/**
 * Renvoie un libellé propre :
 *  - `nom_raison_sociale` si dispo (ex. "MOON EXPERTISE")
 *  - sinon `nom_complet` tronqué avant la 1ère parenthèse
 */
function cleanName(s: Suggestion): string {
  const rs = s.nom_raison_sociale?.trim();
  if (rs) return rs;
  const i = s.nom_complet.indexOf(" (");
  return (i === -1 ? s.nom_complet : s.nom_complet.substring(0, i)).trim();
}

export default function NouveauClientForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Champs
  const [search, setSearch] = useState("");
  const [denomination, setDenomination] = useState("");
  const [siren, setSiren] = useState("");
  const [forme, setForme] = useState("");
  const [activite, setActivite] = useState("");
  const [origine, setOrigine] = useState("");
  const [email, setEmail] = useState("");
  const [pipeline, setPipeline] = useState<string>("1 - Tally à envoyer");
  const [jourCloture, setJourCloture] = useState<string>("");
  const [moisCloture, setMoisCloture] = useState<string>("");
  // Adresse siège — auto-fillée depuis annuaire-entreprises sur sélection
  const [adresseSiege, setAdresseSiege] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  // Reprise à partir de — date complète YYYY-MM-DD (par défaut, 1er du mois courant)
  const now = new Date();
  const [debutDate, setDebutDate] = useState<string>(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  );
  // Dirigeant (contact rattaché). Pré-rempli depuis l'annuaire (cas reprise),
  // sinon saisi à la main (cas création). Civilité obligatoire pour la LDM —
  // l'annuaire ne la donne pas, donc toujours à choisir manuellement.
  const [dirigeantCivilite, setDirigeantCivilite] = useState<"M." | "Mme" | "">("");
  const [dirigeantPrenom, setDirigeantPrenom] = useState<string>("");
  const [dirigeantNomFamille, setDirigeantNomFamille] = useState<string>("");
  const [dirigeantQualite, setDirigeantQualite] = useState<string>("");
  const [addDirigeantAsContact, setAddDirigeantAsContact] = useState(true);

  // Date de clôture 1ère mission (= fin_mission_date) — par défaut 31/12 année en cours
  const [clotureMission, setClotureMission] = useState<string>(
    `${now.getFullYear()}-12-31`
  );

  // Honoraires LDM
  const [honosCompta, setHonosCompta] = useState<string>("");
  const [typeHonosBilans, setTypeHonosBilans] = useState<"" | "Inclus" | "Facturés">("");
  const [forfaitBilan, setForfaitBilan] = useState<string>("");
  const [typeHonosJur, setTypeHonosJur] = useState<"" | "Facturés" | "Inclus" | "Non souscrit">("");
  const [honosJur, setHonosJur] = useState<string>("");
  const [tdbPeriode, setTdbPeriode] = useState<"" | "Mensuel" | "Trimestriel" | "Non souscrit">("");
  const [tdbHonosPeriode, setTdbHonosPeriode] = useState<string>("");
  // Honoraires one-shot (création + reprise) — saisies à la création
  const [typeHonosCreation, setTypeHonosCreation] = useState<"" | "Facturés" | "Non souscrit">("");
  const [honosCreation, setHonosCreation] = useState<string>("");
  const [typeHonosReprise, setTypeHonosReprise] = useState<"" | "Facturés" | "Non souscrit">("");
  const [honosReprise, setHonosReprise] = useState<string>("");

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [usedFallback, setUsedFallback] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = search.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setSearchError(null);
      setUsedFallback(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      setUsedFallback(null);
      try {
        // 1. Recherche complète
        const r = await fetch(
          `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=15`
        );
        if (!r.ok) throw new Error(`API ${r.status}`);
        const json = (await r.json()) as { results: Suggestion[] };
        let results = json.results ?? [];

        // 2. Fallback : si 0 résultats et plusieurs mots, on retire le dernier
        // mot (souvent incomplet, ex. "moon ex" -> "moon") et on réessaie.
        // L'API matche par mot complet uniquement.
        if (results.length === 0) {
          const parts = q.split(/\s+/);
          if (parts.length > 1) {
            const reduced = parts.slice(0, -1).join(" ");
            if (reduced.length >= 2) {
              const r2 = await fetch(
                `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(reduced)}&per_page=15`
              );
              if (r2.ok) {
                const json2 = (await r2.json()) as { results: Suggestion[] };
                const fallbackResults = json2.results ?? [];
                if (fallbackResults.length > 0) {
                  results = fallbackResults;
                  setUsedFallback(reduced);
                }
              }
            }
          }
        }

        setSuggestions(results);
        setOpen(true);
      } catch (e) {
        setSuggestions([]);
        setSearchError((e as Error).message || "Erreur réseau");
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  function pickSuggestion(s: Suggestion) {
    setDenomination(cleanName(s));
    setSiren(s.siren);
    if (s.nature_juridique) {
      const mapped = NATURE_TO_FORME[s.nature_juridique];
      if (mapped) setForme(mapped);
    }
    // Activité depuis le code NAF
    const naf = s.activite_principale ?? s.siege?.activite_principale;
    const inferredActivite = activiteFromNaf(naf);
    if (inferredActivite) setActivite(inferredActivite);

    // Dirigeant : premier dirigeant personne physique. On remplit prénom et
    // nom séparément ; civilité reste vide (l'annuaire ne la donne pas).
    const d = (s.dirigeants ?? []).find((x) => x.type_dirigeant === "personne physique");
    const parts = extractDirigeantParts(d);
    if (parts) {
      setDirigeantPrenom(parts.prenom);
      setDirigeantNomFamille(parts.nom);
      if (d?.qualite) setDirigeantQualite(d.qualite);
    } else {
      setDirigeantPrenom("");
      setDirigeantNomFamille("");
      setDirigeantQualite("");
    }

    // Adresse du siège (depuis annuaire-entreprises)
    if (s.siege?.adresse) setAdresseSiege(s.siege.adresse);
    if (s.siege?.code_postal) setCodePostal(s.siege.code_postal);
    if (s.siege?.libelle_commune) setVille(s.siege.libelle_commune);

    // Clôture : défaut 31/12 pour les sociétés commerciales courantes (pas dans l'API)
    const mappedForme = s.nature_juridique ? NATURE_TO_FORME[s.nature_juridique] : null;
    if (mappedForme && ["SAS", "SARL", "EURL", "SASU", "SA", "SELARL", "SELAS"].includes(mappedForme)) {
      if (!jourCloture) setJourCloture("31");
      if (!moisCloture) setMoisCloture("12");
    }

    setSearch("");
    setSuggestions([]);
    setOpen(false);
  }

  function parseMontant(s: string): number | null {
    const trimmed = s.trim().replace(",", ".");
    if (!trimmed) return null;
    const n = parseFloat(trimmed);
    return Number.isNaN(n) ? null : n;
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation bloquante : les 4 champs strictement obligatoires.
    const missing: string[] = [];
    if (!denomination.trim()) missing.push("Nom du dossier");
    if (addDirigeantAsContact) {
      if (!dirigeantCivilite) missing.push("Sexe du dirigeant");
      if (!dirigeantPrenom.trim()) missing.push("Prénom du dirigeant");
      if (!dirigeantNomFamille.trim()) missing.push("Nom du dirigeant");
    }
    if (missing.length > 0) {
      setError(`Champ${missing.length > 1 ? "s" : ""} obligatoire${missing.length > 1 ? "s" : ""} manquant${missing.length > 1 ? "s" : ""} : ${missing.join(", ")}.`);
      return;
    }

    const debut = debutDate || null;

    // Logique métier honoraires : un montant n'a de sens que si le flag = "Facturés"
    // (bilan/juridique/créa/reprise) ou si une période est définie (pilotage).
    // Sinon on force 0.
    const finalBilan =
      typeHonosBilans === "Facturés" ? parseMontant(forfaitBilan) ?? 0 : 0;
    const finalJur =
      typeHonosJur === "Facturés" ? parseMontant(honosJur) ?? 0 : 0;
    const finalCreation =
      typeHonosCreation === "Facturés" ? parseMontant(honosCreation) ?? 0 : 0;
    const finalReprise =
      typeHonosReprise === "Facturés" ? parseMontant(honosReprise) ?? 0 : 0;
    const isSouscritTdb = tdbPeriode === "Mensuel" || tdbPeriode === "Trimestriel";
    const finalTdb = isSouscritTdb ? parseMontant(tdbHonosPeriode) ?? 0 : 0;

    startTransition(async () => {
      try {
        const { id } = await createClientFromSiren({
          denomination: denomination.trim(),
          siren: siren.trim() || null,
          forme: forme || null,
          activite: activite || null,
          origine: origine || null,
          email: email.trim() || null,
          pipeline_statut: pipeline,
          jour_cloture: jourCloture ? parseInt(jourCloture, 10) : null,
          mois_cloture: moisCloture ? parseInt(moisCloture, 10) : null,
          debut_obligations: debut,
          fin_mission_date: clotureMission || null,
          adresse_siege: adresseSiege.trim() || null,
          code_postal: codePostal.trim() || null,
          ville: ville.trim() || null,
          honoraires_compta: parseMontant(honosCompta) ?? 0,
          forfait_bilan: finalBilan,
          honoraires_jur: finalJur,
          honoraires_creation: finalCreation,
          honoraires_reprise: finalReprise,
          tdb_honos_periode: finalTdb,
          type_honos_bilans: typeHonosBilans || null,
          type_honos_jur: typeHonosJur || null,
          type_honos_creation: typeHonosCreation || null,
          type_honos_reprise: typeHonosReprise || null,
          tdb_periode: tdbPeriode || null,
          interlocuteur:
            addDirigeantAsContact && dirigeantNomFamille.trim()
              ? {
                  civilite: dirigeantCivilite || null,
                  prenom: dirigeantPrenom.trim() || null,
                  nom: dirigeantNomFamille.trim(),
                  qualite: dirigeantQualite || null,
                }
              : null,
        });
        router.push(`/clients/${id}`);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-lg border bg-card p-6">
      {/* Recherche entreprise */}
      <div ref={ref} className="relative">
        <label className="text-xs font-medium text-zinc-700 mb-1 block">
          Rechercher une entreprise <span className="text-zinc-400 font-normal">· nom ou SIREN</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ex. MOON Expertise · 937837193"
            className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 focus:border-[hsl(var(--gold))]/60 pr-9"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
              ⏳
            </div>
          )}
        </div>
        {open && (
          <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white border rounded-lg shadow-xl max-h-80 overflow-auto py-1 animate-slide-up-fade">
            {searchError && (
              <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50">
                Erreur recherche · {searchError}
              </div>
            )}
            {usedFallback && (
              <div className="px-3 py-1.5 text-[11px] text-zinc-600 bg-amber-50 border-b border-amber-100">
                Résultats élargis sur <span className="font-medium">«&nbsp;{usedFallback}&nbsp;»</span>
                <span className="text-zinc-400"> · l'API exige des mots complets</span>
              </div>
            )}
            {!searchError && suggestions.length === 0 && !loading && (
              <div className="px-3 py-3 text-sm text-zinc-500">
                Aucun résultat pour <span className="font-medium">{search}</span>
                <div className="text-[11px] text-zinc-400 mt-1">Essaie avec un mot complet (l'API ne fait pas de préfixe).</div>
              </div>
            )}
            {suggestions.map((s) => {
              const cp = s.siege?.code_postal ?? null;
              const ville = s.siege?.libelle_commune ?? null;
              const lieu = [cp, ville].filter(Boolean).join(" ");
              return (
                <button
                  key={s.siren}
                  type="button"
                  onClick={() => pickSuggestion(s)}
                  className="w-full text-left px-3 py-2 hover:bg-zinc-50 transition-colors flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{cleanName(s)}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-1.5">
                      <span className="tabular-nums">SIREN {s.siren}</span>
                      {s.nature_juridique && (
                        <span>· {NATURE_TO_FORME[s.nature_juridique] ?? `Cat. ${s.nature_juridique}`}</span>
                      )}
                      {lieu && <span className="text-zinc-500">· {lieu}</span>}
                    </div>
                  </div>
                  <span className="text-[hsl(var(--gold))] opacity-60 shrink-0">↵</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="text-[11px] text-zinc-500 mt-1.5">
          Données publiques · annuaire-entreprises.data.gouv.fr · les champs ci-dessous sont pré-remplis sur sélection.
        </div>
      </div>

      {/* ====================================================================
          SECTION 1 — INFOS DE BASE (pour la lettre de mission)
      ==================================================================== */}
      <SectionTitle
        n={1}
        title="Infos de base"
        sub="Identité du dossier et du dirigeant · alimentent la lettre de mission"
      />

      <Field label="Nom du dossier" required hint="Scrapé depuis l'annuaire">
        <input
          type="text"
          value={denomination}
          onChange={(e) => setDenomination(e.target.value)}
          required
          className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(denomination))}
          placeholder="ex. MOON Expertise"
        />
      </Field>

      <div className="rounded-md border bg-zinc-50/60 px-3 py-3 space-y-2.5">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={addDirigeantAsContact}
            onChange={(e) => setAddDirigeantAsContact(e.target.checked)}
            className="accent-[hsl(var(--gold))]"
          />
          <span className="text-xs font-medium text-zinc-700">
            Dirigeant (contact rattaché)
            <span className="text-zinc-400 font-normal"> · pour la lettre de mission</span>
          </span>
        </label>

        {addDirigeantAsContact && (
          <div className="space-y-2.5">
            <div>
              <span className="text-xs font-medium text-zinc-700 mb-1 block">
                Sexe <span className="text-rose-500 ml-0.5">*</span>
              </span>
              <div className="flex gap-1">
                {(["M.", "Mme"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDirigeantCivilite(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-sm font-medium border transition",
                      dirigeantCivilite === c
                        ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))]"
                        : dirigeantCivilite === ""
                        ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
                        : "bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400"
                    )}
                  >
                    {c === "M." ? "Monsieur" : "Madame"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Prénom" required hint="Scrapé depuis l'annuaire">
                <input
                  type="text"
                  value={dirigeantPrenom}
                  onChange={(e) => setDirigeantPrenom(e.target.value)}
                  placeholder="ex. Benjamin"
                  className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(dirigeantPrenom))}
                />
              </Field>
              <Field label="Nom" required hint="Scrapé depuis l'annuaire">
                <input
                  type="text"
                  value={dirigeantNomFamille}
                  onChange={(e) => setDirigeantNomFamille(e.target.value)}
                  placeholder="ex. PEREZ"
                  className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(dirigeantNomFamille))}
                />
              </Field>
            </div>

            {dirigeantQualite && (
              <div className="text-[11px] text-zinc-500">
                Qualité détectée · {dirigeantQualite}
              </div>
            )}
          </div>
        )}
      </div>

      <Field label="Activité" hint="Scrapé depuis l'annuaire">
        <input
          type="text"
          value={activite}
          onChange={(e) => setActivite(e.target.value)}
          placeholder="Texte libre · auto-rempli depuis l'annuaire si dossier existant"
          className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(activite))}
        />
      </Field>

      <Field label="Date de clôture 1ère mission">
        <input
          type="date"
          value={clotureMission}
          onChange={(e) => setClotureMission(e.target.value)}
          className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(clotureMission))}
        />
        <div className="text-[11px] text-zinc-500 mt-1">
          Date de fin du premier exercice traité par MOON
        </div>
      </Field>

      <Field label="Adresse ligne 1" hint="Scrapé depuis l'annuaire">
        <input
          type="text"
          value={adresseSiege}
          onChange={(e) => setAdresseSiege(e.target.value)}
          placeholder="Pré-rempli depuis l'annuaire entreprises si dossier existant"
          className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(adresseSiege))}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Code postal" hint="Scrapé">
          <input
            type="text"
            value={codePostal}
            onChange={(e) => setCodePostal(e.target.value.replace(/\D/g, "").slice(0, 5))}
            maxLength={5}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(codePostal))}
          />
        </Field>
        <div className="col-span-2">
          <Field label="Ville" hint="Scrapé">
            <input
              type="text"
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(ville))}
            />
          </Field>
        </div>
      </div>

      {/* ====================================================================
          SECTION 2 — HONORAIRES (pour la lettre de mission)
      ==================================================================== */}
      <SectionTitle
        n={2}
        title="Honoraires"
        sub="Forfaits qui apparaîtront dans la lettre de mission"
      />

      <Field label="Forfait comptable">
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            value={honosCompta}
            onChange={(e) => setHonosCompta(e.target.value)}
            placeholder="0"
            className={cn("w-full pl-3 pr-20 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(honosCompta))}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€ HT / mois</span>
        </div>
      </Field>

      <div>
        <span className="text-xs font-medium text-zinc-700 mb-1 block">Forfait bilan</span>
        <RadioChips
          options={["Facturés", "Inclus"]}
          value={typeHonosBilans}
          onChange={(v) => setTypeHonosBilans(v as "" | "Inclus" | "Facturés")}
        />
        {typeHonosBilans === "Facturés" && (
          <div className="mt-2 relative">
            <input
              type="text"
              inputMode="decimal"
              value={forfaitBilan}
              onChange={(e) => setForfaitBilan(e.target.value)}
              placeholder="0"
              className={cn("w-full pl-3 pr-20 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(forfaitBilan))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€ HT / an</span>
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-medium text-zinc-700 mb-1 block">Forfait juridique</span>
        <RadioChips
          options={["Facturés", "Inclus", "Non souscrit"]}
          value={typeHonosJur}
          onChange={(v) => setTypeHonosJur(v as "" | "Facturés" | "Inclus" | "Non souscrit")}
        />
        {typeHonosJur === "Facturés" && (
          <div className="mt-2 relative">
            <input
              type="text"
              inputMode="decimal"
              value={honosJur}
              onChange={(e) => setHonosJur(e.target.value)}
              placeholder="0"
              className={cn("w-full pl-3 pr-20 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(honosJur))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€ HT / an</span>
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-medium text-zinc-700 mb-1 block">Forfait pilotage</span>
        <RadioChips
          options={["Mensuel", "Trimestriel", "Non souscrit"]}
          value={tdbPeriode}
          onChange={(v) => setTdbPeriode(v as "" | "Mensuel" | "Trimestriel" | "Non souscrit")}
        />
        {(tdbPeriode === "Mensuel" || tdbPeriode === "Trimestriel") && (
          <div className="mt-2 relative">
            <input
              type="text"
              inputMode="decimal"
              value={tdbHonosPeriode}
              onChange={(e) => setTdbHonosPeriode(e.target.value)}
              placeholder="0"
              className={cn("w-full pl-3 pr-28 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(tdbHonosPeriode))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">
              € HT / {tdbPeriode === "Mensuel" ? "mois" : "trimestre"}
            </span>
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-medium text-zinc-700 mb-1 block">Forfait création <span className="text-zinc-400 font-normal">· one-shot</span></span>
        <RadioChips
          options={["Facturés", "Non souscrit"]}
          value={typeHonosCreation}
          onChange={(v) => setTypeHonosCreation(v as "" | "Facturés" | "Non souscrit")}
        />
        {typeHonosCreation === "Facturés" && (
          <div className="mt-2 relative">
            <input
              type="text"
              inputMode="decimal"
              value={honosCreation}
              onChange={(e) => setHonosCreation(e.target.value)}
              placeholder="0"
              className={cn("w-full pl-3 pr-16 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(honosCreation))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€ HT</span>
          </div>
        )}
      </div>

      <div>
        <span className="text-xs font-medium text-zinc-700 mb-1 block">Forfait reprise <span className="text-zinc-400 font-normal">· one-shot</span></span>
        <RadioChips
          options={["Facturés", "Non souscrit"]}
          value={typeHonosReprise}
          onChange={(v) => setTypeHonosReprise(v as "" | "Facturés" | "Non souscrit")}
        />
        {typeHonosReprise === "Facturés" && (
          <div className="mt-2 relative">
            <input
              type="text"
              inputMode="decimal"
              value={honosReprise}
              onChange={(e) => setHonosReprise(e.target.value)}
              placeholder="0"
              className={cn("w-full pl-3 pr-16 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(honosReprise))}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500">€ HT</span>
          </div>
        )}
      </div>

      {/* ====================================================================
          SECTION 3 — DÉTAILS CRM (pas dans la LDM, mais utiles au suivi)
      ==================================================================== */}
      <SectionTitle
        n={3}
        title="Détails CRM"
        sub="Suivi interne · n'apparaît pas dans la lettre de mission"
      />

      <div className="grid grid-cols-2 gap-3">
        <Field label="SIREN">
          <input
            type="text"
            value={siren}
            onChange={(e) => setSiren(e.target.value.replace(/\D/g, ""))}
            maxLength={9}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums", inputFill(siren))}
            placeholder="9 chiffres"
          />
        </Field>
        <Field label="Forme juridique">
          <select
            value={forme}
            onChange={(e) => setForme(e.target.value)}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(forme))}
          >
            <option value="">À renseigner</option>
            {FORMES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Origine">
          <select
            value={origine}
            onChange={(e) => setOrigine(e.target.value)}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(origine))}
          >
            <option value="">À renseigner</option>
            {ORIGINES.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="contact@…"
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(email))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Pipeline">
          <select
            value={pipeline}
            onChange={(e) => setPipeline(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30"
          >
            {PIPELINES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Reprise à partir de">
          <input
            type="date"
            value={debutDate}
            onChange={(e) => setDebutDate(e.target.value)}
            className="w-full px-3 py-2 rounded-md border border-zinc-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30 tabular-nums"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Jour de clôture (exercice)">
          <select
            value={jourCloture}
            onChange={(e) => setJourCloture(e.target.value)}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(jourCloture))}
          >
            <option value="">À renseigner</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>{String(d).padStart(2, "0")}</option>
            ))}
          </select>
        </Field>
        <Field label="Mois de clôture (exercice)">
          <select
            value={moisCloture}
            onChange={(e) => setMoisCloture(e.target.value)}
            className={cn("w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--gold))]/30", inputFill(moisCloture))}
          >
            <option value="">À renseigner</option>
            {["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"].map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
        </Field>
      </div>

      {siren.length === 9 && (
        <div className="rounded-md border bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600 space-x-3">
          <span>Liens auto-générés :</span>
          <a
            href={`https://www.pappers.fr/entreprise/${siren}`}
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >
            Pappers ↗
          </a>
          <a
            href={`https://data.inpi.fr/entreprises/${siren}`}
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >
            INPI ↗
          </a>
          <a
            href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`}
            target="_blank"
            rel="noopener"
            className="text-blue-600 hover:underline"
          >
            Annuaire ↗
          </a>
        </div>
      )}

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className={cn(
            "px-4 py-2 rounded-md bg-[#0D1122] text-white text-sm font-medium transition-colors",
            isPending ? "opacity-60" : "hover:bg-[#0D1122]/85"
          )}
        >
          {isPending ? "Création…" : "Créer la fiche"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/clients")}
          className="px-3 py-2 rounded-md text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  /** Petite annotation à droite du label (ex. "Scrapé depuis l'annuaire" en vert). */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700 mb-1 flex items-center gap-1.5">
        <span>
          {label}
          {required && <span className="text-rose-500 ml-0.5">*</span>}
        </span>
        {hint && (
          <span className="text-[10px] font-normal text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

/** Séparateur de section · titre numéroté + sous-titre, ligne dorée. */
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
    <div className="pt-3 pb-1">
      <div className="flex items-baseline gap-2">
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-[hsl(var(--gold))]/15 text-[hsl(var(--gold-dark))] text-xs font-semibold">
          {n}
        </span>
        <h3 className="text-base font-semibold tracking-tight text-zinc-900">
          {title}
        </h3>
      </div>
      <p className="text-[11px] text-zinc-500 ml-8 mt-0.5">{sub}</p>
      <div className="h-px bg-zinc-200 mt-2" />
    </div>
  );
}

/** Sélecteur radio en chips · vide si rien sélectionné (ambre), gold si actif. */
function RadioChips({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(value === opt ? "" : opt)}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm font-medium border transition",
            value === opt
              ? "bg-[hsl(var(--gold))]/15 border-[hsl(var(--gold))]/60 text-[hsl(var(--gold-dark))]"
              : value === ""
              ? "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100"
              : "bg-white border-zinc-300 text-zinc-600 hover:border-zinc-400"
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
