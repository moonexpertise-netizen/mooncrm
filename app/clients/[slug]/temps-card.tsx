import { createClient } from "@/lib/supabase/server";
import { fmtEuro } from "@/lib/utils";
import { Card, FieldReadonly } from "./_components";

/**
 * Carte "Temps & rentabilité" de la fiche dossier.
 *
 * Somme le temps saisi (tous collaborateurs) sur CE dossier pour l'exercice
 * courant, et le rapproche du forfait comptable -> taux horaire effectif
 * (honoraires ÷ heures). C'est l'intérêt central de la saisie des temps :
 * voir d'un coup d'œil si un dossier est rentable.
 *
 * Server component autonome : fait sa propre requête (RLS : un utilisateur
 * approuvé lit les temps). Affiché en lecture seule.
 */
export default async function TempsCard({
  clientId,
  honorairesCompta,
}: {
  clientId: string;
  honorairesCompta: number | null;
}) {
  const year = new Date().getUTCFullYear();
  const sb = await createClient();
  const { data } = await sb
    .from("time_entries")
    .select("duree_minutes")
    .eq("client_id", clientId)
    .eq("annee", year);

  const totalMin = ((data ?? []) as { duree_minutes: number }[]).reduce(
    (s, r) => s + (r.duree_minutes ?? 0),
    0
  );
  const hours = totalMin / 60;
  const hono = honorairesCompta ?? 0;
  const tauxEffectif = hours > 0 ? Math.round(hono / hours) : null;

  return (
    <Card title={`Temps & rentabilité ${year}`}>
      {totalMin === 0 ? (
        <p className="text-sm text-muted-foreground py-1">
          Aucun temps saisi sur ce dossier pour {year}.
        </p>
      ) : (
        <>
          <FieldReadonly
            label="Temps passé"
            value={`${hours.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`}
          />
          <FieldReadonly label="Forfait comptable" value={fmtEuro(hono) ?? "-"} />
          <div className="border-t pt-2 mt-1">
            <FieldReadonly
              label="Taux effectif"
              value={tauxEffectif !== null ? `${tauxEffectif.toLocaleString("fr-FR")} €/h` : "-"}
            />
          </div>
        </>
      )}
    </Card>
  );
}
