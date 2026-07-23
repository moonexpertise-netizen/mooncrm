"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractRueOnly } from "@/lib/adresse";
import { libelleFromNaf } from "@/lib/naf-libelles";
import { formeFromNatureJuridique, type FormeJuridique } from "@/lib/nature-to-forme";
import { toastError } from "@/lib/toast-helpers";
import { useCan } from "@/app/_components/permissions-context";
import { fetchInpiCloture, importFromAnnuaire } from "./actions";

/**
 * Bouton "Annuaire" sur la fiche client. Disponible si le client a un SIREN.
 * Au clic, ouvre une modale qui :
 *  1. Fetch annuaire-entreprises avec le SIREN
 *  2. Compare valeur actuelle CRM vs valeur scrapée pour chaque champ
 *  3. Pré-coche les champs qui diffèrent
 *  4. L'utilisateur valide la sélection → importFromAnnuaire écrase
 *
 * Champs couverts : adresse, code postal, ville, activité (libellé NAF INSEE),
 * forme juridique, clôture d'exercice (via l'API INPI RNE) et dirigeant
 * (civilité conservée, prénom + nom). Soit tout ce dont la LDM a besoin.
 */

type AnnuaireData = {
  denomination: string;
  siren: string;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  activite: string | null;
  forme: FormeJuridique | null;
  /** Date de clôture d'exercice depuis l'API INPI RNE (null si INPI indispo) */
  cloture: { jour: number; mois: number } | null;
  dirigeant: { prenom: string | null; nom: string } | null;
};

type CurrentData = {
  adresse_siege: string | null;
  code_postal: string | null;
  ville: string | null;
  activite: string | null;
  forme: string | null;
  jour_cloture: number | null;
  mois_cloture: number | null;
  dirigeant: { prenom: string | null; nom: string } | null;
};

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/(\s|-)/)
    .map((p) => (p.match(/[\s-]/) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join("");
}

export default function AnnuaireButton({
  clientId,
  siren,
  current,
}: {
  clientId: string;
  siren: string | null;
  current: CurrentData;
}) {
  const canEdit = useCan("edit_clients");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AnnuaireData | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Fetch quand on ouvre la modale (une fois)
  useEffect(() => {
    if (!open || data || loading) return;
    fetchAnnuaire();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!siren || siren.length !== 9) {
    return (
      <button
        disabled
        title="SIREN requis pour interroger l'annuaire"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-100 text-zinc-400 text-xs font-medium cursor-not-allowed"
      >
        <Building2 className="h-3.5 w-3.5" />
        Annuaire
      </button>
    );
  }

  async function fetchAnnuaire() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?q=${siren}`
      );
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = (await r.json()) as {
        results: Array<{
          siren: string;
          nom_complet: string;
          nom_raison_sociale?: string | null;
          nature_juridique?: string | null;
          activite_principale?: string | null;
          siege?: {
            adresse?: string | null;
            code_postal?: string | null;
            libelle_commune?: string | null;
            activite_principale?: string | null;
          } | null;
          dirigeants?: Array<{
            nom?: string | null;
            prenoms?: string | null;
            type_dirigeant?: string | null;
          }>;
        }>;
      };
      const result = json.results?.[0];
      if (!result) {
        setError(`SIREN ${siren} introuvable sur l'annuaire`);
        return;
      }

      // Dirigeant (première personne physique)
      const d = (result.dirigeants ?? []).find(
        (x) => x.type_dirigeant === "personne physique"
      );
      const dirigeant =
        d && (d.nom || d.prenoms)
          ? {
              prenom: d.prenoms
                ? toTitleCase((d.prenoms ?? "").trim().split(/\s+/)[0])
                : null,
              nom: (d.nom ?? "").trim().toUpperCase(),
            }
          : null;

      const codePostal = result.siege?.code_postal?.trim() || null;
      const ville = result.siege?.libelle_commune?.trim() || null;
      const adresseRaw = result.siege?.adresse?.trim() || null;
      // On enlève CP + ville du champ adresse pour ne garder QUE la rue
      const adresseRue = adresseRaw
        ? extractRueOnly(adresseRaw, codePostal, ville)
        : null;

      // Activité : libellé NAF officiel INSEE (ex. "Ingénierie, études techniques").
      // Si code inconnu, on garde le code brut (l'utilisateur pourra le compléter).
      const naf = result.activite_principale ?? result.siege?.activite_principale;
      const activite = naf ? libelleFromNaf(naf) ?? naf : null;

      // Forme juridique : mappage du code INSEE nature_juridique
      const forme = formeFromNatureJuridique(result.nature_juridique);

      // Date de clôture : appel à l'API INPI RNE (côté serveur via Action).
      // Si l'INPI est indispo (credentials manquants, rate-limit, etc.), on
      // retourne null et la ligne reste vide côté annuaire.
      const cloture = await fetchInpiCloture(result.siren).catch(() => null);

      const newData: AnnuaireData = {
        denomination: result.nom_raison_sociale?.trim() || result.nom_complet,
        siren: result.siren,
        adresse: adresseRue,
        code_postal: codePostal,
        ville,
        activite,
        forme,
        cloture,
        dirigeant,
      };
      setData(newData);

      // Pré-cocher les champs qui diffèrent (ou qui sont vides côté CRM)
      const sel: Record<string, boolean> = {};
      if (newData.adresse && newData.adresse !== current.adresse_siege) sel.adresse = true;
      if (newData.code_postal && newData.code_postal !== current.code_postal) sel.code_postal = true;
      if (newData.ville && newData.ville !== current.ville) sel.ville = true;
      if (newData.activite && newData.activite !== current.activite) sel.activite = true;
      if (newData.forme && newData.forme !== current.forme) sel.forme = true;
      if (
        newData.cloture &&
        (newData.cloture.jour !== current.jour_cloture ||
          newData.cloture.mois !== current.mois_cloture)
      ) {
        sel.cloture = true;
      }
      if (
        newData.dirigeant &&
        (newData.dirigeant.nom !== current.dirigeant?.nom ||
          newData.dirigeant.prenom !== current.dirigeant?.prenom)
      ) {
        sel.dirigeant = true;
      }
      setSelected(sel);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  function onImport() {
    if (!data || !canEdit) return;
    setError(null);
    const patch: {
      adresse_siege?: string | null;
      code_postal?: string | null;
      ville?: string | null;
      activite?: string | null;
      forme?: string | null;
      jour_cloture?: number | null;
      mois_cloture?: number | null;
      dirigeant?: { prenom: string | null; nom: string };
    } = {};
    if (selected.adresse) patch.adresse_siege = data.adresse;
    if (selected.code_postal) patch.code_postal = data.code_postal;
    if (selected.ville) patch.ville = data.ville;
    if (selected.activite) patch.activite = data.activite;
    if (selected.forme && data.forme) patch.forme = data.forme;
    if (selected.cloture && data.cloture) {
      patch.jour_cloture = data.cloture.jour;
      patch.mois_cloture = data.cloture.mois;
    }
    if (selected.dirigeant && data.dirigeant) patch.dirigeant = data.dirigeant;

    if (Object.keys(patch).length === 0) {
      setError("Aucun champ sélectionné");
      return;
    }

    startTransition(async () => {
      try {
        await importFromAnnuaire(clientId, patch);
        setOpen(false);
        setData(null); // force re-fetch au prochain ouverture
        // Import massif : adresse, code postal, ville, activite, forme,
        // jour/mois cloture, dirigeant. Tout est visible sur la fiche.
        // Sans refresh, les valeurs en base sont mises a jour mais la
        // fiche montre les anciennes.
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        toastError(e, "Echec de l'import depuis l'annuaire");
      }
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={!canEdit}
        title={
          canEdit
            ? "Récupérer les infos depuis l'annuaire des entreprises"
            : "Droit d'édition requis pour importer depuis l'annuaire"
        }
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white border border-zinc-300 text-zinc-700 text-xs font-medium hover:bg-zinc-50 hover:border-zinc-400 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Building2 className="h-3.5 w-3.5" />
        Annuaire
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in p-4">
          <div className="bg-white rounded-lg shadow-2xl border max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  Récupérer les infos depuis l&apos;annuaire-entreprises
                </h3>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  SIREN {siren}, données publiques data.gouv.fr
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-md transition"
                title="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4">
              {loading && (
                <div className="text-center py-10 text-sm text-zinc-500">
                  <RefreshCw className="h-5 w-5 mx-auto animate-spin text-zinc-400 mb-2" />
                  Interrogation de l&apos;annuaire…
                </div>
              )}

              {error && !loading && (
                <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900 mb-3">
                  {error}
                </div>
              )}

              {data && !loading && (
                <>
                  <div className="mb-3 px-3 py-2 rounded-md bg-zinc-50 border text-xs text-zinc-600">
                    <span className="font-medium text-zinc-800">{data.denomination}</span>
                    {" "}<span className="text-zinc-300 dark:text-zinc-600" aria-hidden>|</span>{" "}
                    <span className="text-zinc-400">SIREN </span>
                    <span className="tabular-nums">{data.siren}</span>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 border-b">
                        <th className="px-2 py-2 w-8"></th>
                        <th className="px-2 py-2">Champ</th>
                        <th className="px-2 py-2">Actuel</th>
                        <th className="px-2 py-2">Depuis l&apos;annuaire</th>
                      </tr>
                    </thead>
                    <tbody>
                      <Row
                        field="adresse"
                        label="Adresse"
                        current={current.adresse_siege}
                        nouveau={data.adresse}
                        selected={selected.adresse ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, adresse: v }))}
                      />
                      <Row
                        field="code_postal"
                        label="Code postal"
                        current={current.code_postal}
                        nouveau={data.code_postal}
                        selected={selected.code_postal ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, code_postal: v }))}
                      />
                      <Row
                        field="ville"
                        label="Ville"
                        current={current.ville}
                        nouveau={data.ville}
                        selected={selected.ville ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, ville: v }))}
                      />
                      <Row
                        field="activite"
                        label="Activité"
                        current={current.activite}
                        nouveau={data.activite}
                        selected={selected.activite ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, activite: v }))}
                      />
                      <Row
                        field="forme"
                        label="Forme juridique"
                        current={current.forme}
                        nouveau={data.forme}
                        selected={selected.forme ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, forme: v }))}
                      />
                      <Row
                        field="cloture"
                        label="Clôture exercice"
                        current={
                          current.jour_cloture && current.mois_cloture
                            ? `${String(current.jour_cloture).padStart(2, "0")}/${String(current.mois_cloture).padStart(2, "0")}`
                            : null
                        }
                        nouveau={
                          data.cloture
                            ? `${String(data.cloture.jour).padStart(2, "0")}/${String(data.cloture.mois).padStart(2, "0")}`
                            : null
                        }
                        selected={selected.cloture ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, cloture: v }))}
                      />
                      <Row
                        field="dirigeant"
                        label="Dirigeant"
                        current={
                          current.dirigeant
                            ? `${current.dirigeant.prenom ?? ""} ${current.dirigeant.nom}`.trim()
                            : null
                        }
                        nouveau={
                          data.dirigeant
                            ? `${data.dirigeant.prenom ?? ""} ${data.dirigeant.nom}`.trim()
                            : null
                        }
                        selected={selected.dirigeant ?? false}
                        onToggle={(v) => setSelected((s) => ({ ...s, dirigeant: v }))}
                      />
                    </tbody>
                  </table>

                  <div className="mt-4 text-[11px] text-zinc-500">
                    Coche les champs à écraser. Les valeurs identiques ne sont pas pré-cochées.
                  </div>
                </>
              )}
            </div>

            <div className="border-t px-5 py-3 flex items-center justify-end gap-2 bg-zinc-50/50">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900 transition"
              >
                Annuler
              </button>
              <button
                onClick={onImport}
                disabled={!data || isPending || Object.values(selected).every((v) => !v)}
                className={cn(
                  "px-4 py-1.5 rounded-md bg-[hsl(var(--gold))] text-white text-xs font-medium transition",
                  (!data || isPending || Object.values(selected).every((v) => !v))
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:opacity-90"
                )}
              >
                {isPending ? "Import…" : "Importer la sélection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  current,
  nouveau,
  selected,
  onToggle,
}: {
  field: string;
  label: string;
  current: string | null;
  nouveau: string | null;
  selected: boolean;
  onToggle: (v: boolean) => void;
}) {
  const identical = (current ?? "") === (nouveau ?? "");
  const empty = !nouveau;
  return (
    <tr className={cn("border-b last:border-0", selected && "bg-[hsl(var(--gold))]/5")}>
      <td className="px-2 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onToggle(e.target.checked)}
          disabled={empty || identical}
          className="accent-[hsl(var(--gold))]"
        />
      </td>
      <td className="px-2 py-2 font-medium text-zinc-700">{label}</td>
      <td className="px-2 py-2 text-zinc-500">
        {current || <span className="italic text-zinc-400">vide</span>}
      </td>
      <td className="px-2 py-2">
        {empty ? (
          <span className="italic text-zinc-400">non renseigné</span>
        ) : identical ? (
          <span className="text-zinc-500">{nouveau} <span className="text-[10px] text-emerald-600">identique</span></span>
        ) : (
          <span className="text-zinc-900 font-medium">{nouveau}</span>
        )}
      </td>
    </tr>
  );
}
