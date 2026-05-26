import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ParcoursEditor, {
  type EtapeRow,
  type RubriqueRow,
} from "./parcours-editor";

export const dynamic = "force-dynamic";

/**
 * Onglet Paramétrage de l'onboarding : éditeur du parcours par défaut.
 *
 * v1 : un seul parcours par défaut (créé par la migration 0041). Les étapes
 * peuvent être groupées en rubriques avec numérotation personnalisée
 * (migration 0043).
 */
export default async function OnboardingParametragePage() {
  const sb = await createClient();

  const { data: parcours } = await sb
    .from("onboarding_parcours")
    .select("id, nom, description, is_default")
    .eq("is_default", true)
    .maybeSingle();

  if (!parcours) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Aucun parcours par défaut configuré. La migration 0041 aurait dû en
        créer un (« Standard MOON »). Vérifie en base ou réapplique la
        migration.
      </div>
    );
  }

  const [{ data: rubriques }, { data: etapes }] = await Promise.all([
    sb
      .from("onboarding_rubrique")
      .select("id, nom, ordre, numbering_style, numbering_reset")
      .eq("parcours_id", parcours.id)
      .order("ordre", { ascending: true }),
    sb
      .from("onboarding_etape")
      .select("id, task_key, libelle, nom_court, description, ordre, categorie, rubrique_id, conditions_na")
      .eq("parcours_id", parcours.id)
      .order("ordre", { ascending: true }),
  ]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">{parcours.nom}</h2>
            {parcours.description && (
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                {parcours.description}
              </p>
            )}
          </div>
          <div className="text-[11px] text-zinc-500">
            Parcours par défaut · appliqué à tout nouveau dossier signé
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-amber-50/60 border-amber-200 px-3 py-2 text-xs text-amber-900">
        ⓘ Les modifications du parcours s&apos;appliquent uniquement aux <strong>nouveaux dossiers</strong>{" "}
        (à partir de leur signature LDM). Les dossiers existants conservent leurs tâches.{" "}
        <Link
          href="/onboarding/matrice"
          className="underline hover:text-amber-700"
        >
          Aller à la matrice
        </Link>
      </div>

      <ParcoursEditor
        parcoursId={parcours.id}
        rubriques={(rubriques ?? []) as RubriqueRow[]}
        etapes={(etapes ?? []) as EtapeRow[]}
      />
    </div>
  );
}
