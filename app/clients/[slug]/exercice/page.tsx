import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import YearSwitcher from "../year-switcher";
import EcheancierCard from "../echeancier-card";
import { loadClient, loadAllStatusOpts } from "../_data";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

type StatutLogique = "A_FAIRE" | "EN_COURS" | "TERMINE" | "NON_APPLICABLE";

/**
 * Onglet "Échéances" : sélecteur d'année + carte échéancier des obligations
 * pour le client sur l'année sélectionnée.
 */
export default async function ExerciceTab({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const selectedYear = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;

  const client = await loadClient(slug);
  if (!client) notFound();
  const id = client.id;

  const sb = await createClient();
  const [{ data: allSubs }, allStatusOpts, { data: obligations }] = await Promise.all([
    sb.from("obligation_subscriptions").select("type, annee, actif").eq("client_id", id),
    loadAllStatusOpts(),
    sb
      .from("obligations")
      .select(
        "type, periode, annee, echeance, statut_logique, statut_detail, note, obligation_subscriptions!inner(actif)"
      )
      .eq("client_id", id)
      .eq("annee", selectedYear)
      .eq("obligation_subscriptions.actif", true)
      .order("echeance", { ascending: true, nullsFirst: false })
      .order("type")
      .order("periode"),
  ]);

  const colorByKey = new Map<string, string | null>();
  for (const o of allStatusOpts ?? []) {
    if (o.color) colorByKey.set(`${o.type_code}|${o.libelle}`, o.color);
  }

  const yearsSet = new Set<number>((allSubs ?? []).map((s) => s.annee));
  yearsSet.add(CURRENT_YEAR);
  const years = [...yearsSet].sort((a, b) => b - a);

  const activeTypes = (allSubs ?? [])
    .filter((s) => s.annee === selectedYear && s.actif)
    .map((s) => s.type);

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

  return (
    <div className="space-y-6">
      <YearSwitcher years={years} selected={selectedYear} clientId={id} />
      <EcheancierCard
        clientId={id}
        annee={selectedYear}
        items={obligationsSorted}
        hasActiveSubs={activeTypes.length > 0}
      />
    </div>
  );
}
