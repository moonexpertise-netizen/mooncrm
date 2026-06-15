"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFinanceViews } from "@/lib/revalidate-finance";
import { requirePermission } from "@/lib/auth";

/**
 * Server actions partagees pour la page Facturation centralisee.
 * 4 endpoints generiques qui pointent vers la bonne table selon la source.
 */

export type EtatFacturation = "a_facturer" | "facturee" | "sans_facture";

export type FactSource =
  | "caa"
  | "ir"
  | "ago"
  | "bilan"
  | "mission_exc"
  | "creation";

/**
 * Met a jour l'etat facturation d'une ligne, peu importe sa source.
 * - caa/ir : on met a jour la row (client, annee) ; pour IR on synchronise IR+IFI
 * - ago/bilan : on met a jour la row obligations directement par id
 * - mission_exc : on met a jour la row missions_exceptionnelles par id
 * - creation : on met a jour clients.creation_facturation (1 par client,
 *   creation = one-shot non-recurrent)
 */
export async function setFacturationFromCentral(
  source: FactSource,
  rowId: string, // obligation_id, mission_id, OU pour caa/ir : "clientId|annee"
  etat: EtatFacturation | null
): Promise<void> {
  await requirePermission("edit_facturation");
  const sb = await createClient();

  if (source === "ago" || source === "bilan") {
    const { error } = await sb
      .from("obligations")
      .update({ etat_facturation: etat })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }

  if (source === "mission_exc") {
    const { error } = await sb
      .from("missions_exceptionnelles")
      .update({ etat_facturation: etat })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }

  if (source === "caa") {
    // rowId format : "obligationId" car 1 row par client/annee
    const { error } = await sb
      .from("caa_obligations")
      .update({ etat_facturation: etat })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }

  if (source === "ir") {
    // rowId = "clientIrId|annee" pour MAJ synchronisee des 2 rows (IR + IFI).
    const [clientIrId, anneeStr] = rowId.split("|");
    const annee = parseInt(anneeStr, 10);
    if (!clientIrId || Number.isNaN(annee)) {
      throw new Error("ID invalide pour IR : attendu 'clientId|annee'");
    }
    const { error } = await sb
      .from("ir_obligations")
      .update({ etat_facturation: etat })
      .eq("client_ir_id", clientIrId)
      .eq("annee", annee);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }

  if (source === "creation") {
    // rowId = id du client (creation_facturation est sur clients).
    const { error } = await sb
      .from("clients")
      .update({ creation_facturation: etat })
      .eq("id", rowId);
    if (error) throw new Error(error.message);
    revalidateFinanceViews();
    return;
  }
}
