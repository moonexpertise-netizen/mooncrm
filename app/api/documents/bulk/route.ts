import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import { createClient } from "@/lib/supabase/server";
import { generateLDM, type LDMTemplateKey, type LDMDirigeantData } from "@/lib/ldm-generator";
import { LDM_CLIENT_SELECT, toLDMClientData } from "@/lib/ldm-data";
import { requirePermission } from "@/lib/auth";

/**
 * POST /api/documents/bulk
 * body { template: "presentation"|"bnc"|"sociale", clientIds: string[] }
 *
 * Génère une LDM par client (documents SANS saisie : tout vient du dossier)
 * et renvoie un ZIP. Réservé aux modèles paramétrables sans dialogue — les
 * attestations restent unitaires (valeurs propres à chaque client).
 */
const BULK_TEMPLATES = new Set<LDMTemplateKey>(["presentation", "bnc", "sociale"]);
const LABEL: Record<string, string> = { presentation: "PRESENTATION", bnc: "BNC", sociale: "PAIE" };

export async function POST(request: NextRequest) {
  await requirePermission("edit_clients");

  let body: { template?: string; clientIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }
  const template = body.template as LDMTemplateKey;
  const clientIds = Array.isArray(body.clientIds) ? body.clientIds.filter(Boolean) : [];
  if (!BULK_TEMPLATES.has(template)) {
    return NextResponse.json({ error: "modèle non disponible en masse" }, { status: 400 });
  }
  if (clientIds.length === 0) {
    return NextResponse.json({ error: "aucun client sélectionné" }, { status: 400 });
  }

  const sb = await createClient();

  // Clients + contacts (dirigeant = 1er contact lié) en 2 requêtes.
  const [{ data: clients, error: cliErr }, { data: linksRaw }] = await Promise.all([
    sb.from("clients").select(`id, ${LDM_CLIENT_SELECT}`).in("id", clientIds),
    sb
      .from("client_contacts")
      .select("client_id, contacts(nom, prenom, civilite)")
      .in("client_id", clientIds),
  ]);
  if (cliErr) {
    return NextResponse.json({ error: cliErr.message }, { status: 500 });
  }

  // Map client_id -> premier dirigeant.
  const dirByClient = new Map<string, LDMDirigeantData>();
  for (const l of (linksRaw ?? []) as unknown as Array<{
    client_id: string;
    contacts: { nom: string | null; prenom: string | null; civilite: string | null } | null;
  }>) {
    if (!dirByClient.has(l.client_id) && l.contacts) {
      dirByClient.set(l.client_id, {
        civilite: l.contacts.civilite ?? null,
        prenom: l.contacts.prenom ?? null,
        nom: l.contacts.nom ?? null,
      });
    }
  }

  const zip = new PizZip();
  const usedNames = new Set<string>();
  let generated = 0;

  for (const raw of (clients ?? []) as Array<Record<string, unknown>>) {
    const id = raw.id as string;
    const data = toLDMClientData(raw);
    const dirigeant = dirByClient.get(id) ?? { civilite: null, prenom: null, nom: null };
    try {
      const buf = generateLDM(template, data, dirigeant);
      const denom = String(data.denomination).replace(/[\/\\:*?"<>|]/g, "").trim() || "Dossier";
      const annee = data.fin_mission_date
        ? new Date(data.fin_mission_date).getFullYear()
        : new Date().getFullYear();
      let name = `${denom} - LDM ${LABEL[template]} ${annee} Draft.docx`;
      // Anti-collision (dénominations identiques).
      let k = 2;
      while (usedNames.has(name)) name = `${denom} (${k++}) - LDM ${LABEL[template]} ${annee} Draft.docx`;
      usedNames.add(name);
      zip.file(name, buf);
      generated++;
    } catch (e) {
      console.error("[bulk] génération échouée pour", id, e);
    }
  }

  if (generated === 0) {
    return NextResponse.json({ error: "aucun document généré" }, { status: 500 });
  }

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const stamp = LABEL[template];
  const zipName = `LDM ${stamp} - ${generated} dossiers.zip`;
  return new NextResponse(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  });
}
