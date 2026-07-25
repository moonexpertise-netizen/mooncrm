import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/app/_components/page-header";
import ApportsTable, { type ApportListRow } from "./apports-table";

export const dynamic = "force-dynamic";

/**
 * Suivi transversal des apports d'affaires (commissions dues aux apporteurs).
 * Route gated view_finance (middleware). Cf. migration 0091.
 */
export default async function ApportsPage() {
  const sb = await createClient();
  const { data, error } = await sb
    .from("apports_affaires")
    .select("id, apporteur, montant, mode, regle, regle_at, note, created_at, clients!inner(denomination, slug)")
    .order("regle", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
        Erreur de chargement : {error.message}
      </div>
    );
  }

  const rows: ApportListRow[] = (data ?? []).map((r) => {
    const c = r.clients as unknown as { denomination: string; slug: string } | null;
    return {
      id: r.id,
      apporteur: r.apporteur,
      montant: Number(r.montant ?? 0),
      mode: r.mode as "facture" | "carte_cadeau",
      regle: r.regle === true,
      regle_at: r.regle_at ?? null,
      note: r.note ?? null,
      created_at: r.created_at,
      denomination: c?.denomination ?? "—",
      slug: c?.slug ?? "",
    };
  });

  return (
    <div className="space-y-5">
      <PageHeader
        title="Apports d'affaires"
        description="Commissions dues aux apporteurs, suivi des règlements"
      />
      <ApportsTable rows={rows} />
    </div>
  );
}
