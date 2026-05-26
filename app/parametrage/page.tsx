import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isClientBillable } from "@/lib/billable";
import { PageHeader } from "@/app/_components/page-header";
import ParametrageGrid, { type Row } from "./grid";

export const dynamic = "force-dynamic";

const CURRENT_YEAR = 2026;

export default async function ParametragePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const year = sp.year ? parseInt(sp.year, 10) : CURRENT_YEAR;
  const sb = await createClient();

  // 1. Clients (filtre métier Signé + Interne + Sous-traitance)
  const { data: clients } = await sb
    .from("clients")
    .select("id, slug, denomination, siren, pipeline_statut, origine, debut_obligations, groupes(nom)")
    .order("denomination");

  const filtered = (clients ?? []).filter(isClientBillable);
  const clientIds = filtered.map((c) => c.id);

  // Perf : 2 & 3 sont indépendantes une fois clientIds connu. On parallélise
  // → -1 RTT transatlantique (~100ms en moins sur la page).
  const inClientIds = clientIds.length ? clientIds : [""];
  const [{ data: subs }, { data: configs }] = await Promise.all([
    sb
      .from("obligation_subscriptions")
      .select("client_id, type, actif")
      .in("client_id", inClientIds)
      .eq("annee", year)
      .eq("actif", true),
    sb
      .from("client_year_config")
      .select("client_id, regime")
      .in("client_id", inClientIds)
      .eq("annee", year),
  ]);

  const subsByClient = new Map<string, Set<string>>();
  for (const s of subs ?? []) {
    if (!subsByClient.has(s.client_id)) subsByClient.set(s.client_id, new Set());
    subsByClient.get(s.client_id)!.add(s.type);
  }
  const regimeByClient = new Map<string, "IR" | "IS" | null>();
  for (const c of configs ?? []) {
    regimeByClient.set(c.client_id, (c.regime as "IR" | "IS" | null) ?? null);
  }

  const rows: Row[] = filtered.map((c) => {
    const set = subsByClient.get(c.id) ?? new Set();
    const tvaMode =
      (["TVA_MENSUELLE", "TVA_TRIMESTRIELLE", "TVA_ANNUELLE_CA12", "TVA_NON_SOUMIS"].find((m) =>
        set.has(m)
      ) ?? null) as Row["tvaMode"];
    // Année de début (debut_obligations) : 4 premiers chars, null sinon
    const debutYear =
      c.debut_obligations && /^\d{4}/.test(c.debut_obligations)
        ? parseInt(c.debut_obligations.slice(0, 4), 10)
        : null;
    return {
      id: c.id,
      slug: c.slug,
      denomination: c.denomination,
      siren: c.siren,
      groupe:
        (c.groupes as unknown as { nom: string } | null)?.nom ?? null,
      regime: regimeByClient.get(c.id) ?? null,
      tvaMode,
      debutYear,
      subs: {
        TVS: set.has("TVS"),
        IS_ACOMPTE: set.has("IS_ACOMPTE"),
        IS_SOLDE: set.has("IS_SOLDE"),
        CVAE: set.has("CVAE"),
        CVAE_ACOMPTE: set.has("CVAE_ACOMPTE"),
        DAS2: set.has("DAS2"),
        DECL_2561: set.has("DECL_2561"),
        DECL_2777: set.has("DECL_2777"),
        OSS: set.has("OSS"),
        DES: set.has("DES"),
        LIASSE_PLAQUETTE: set.has("LIASSE_PLAQUETTE"),
        AGO_DEPOT: set.has("AGO_DEPOT"),
      },
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paramétrage"
        description="Matrice clients × obligations · édition rapide"
        actions={<YearSelector year={year} />}
      />
      <ParametrageGrid rows={rows} year={year} />
    </div>
  );
}

function YearSelector({ year }: { year: number }) {
  const years = [year - 1, year, year + 1];
  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-zinc-100/70 border border-zinc-200/60">
      {years.map((y) => (
        <Link
          key={y}
          href={`/parametrage?year=${y}`}
          className={
            y === year
              ? "px-3 py-1 rounded-lg text-sm bg-white text-zinc-900 shadow-card font-medium tabular-nums"
              : "px-3 py-1 rounded-lg text-sm text-zinc-600 hover:text-zinc-900 hover:bg-white/50 tabular-nums"
          }
        >
          {y}
        </Link>
      ))}
    </div>
  );
}
