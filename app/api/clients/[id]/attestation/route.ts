import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateAttestationCA,
  type AttestationKey,
} from "@/lib/attestation-generator";

/**
 * GET /api/clients/:id/attestation?template=ca&...champs
 * Génère une attestation .docx (modèle Word) et la renvoie en téléchargement.
 * Extensible : d'autres modèles viendront (template=...).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sp = request.nextUrl.searchParams;
  const tpl = (sp.get("template") ?? "ca") as AttestationKey;
  if (tpl !== "ca") {
    return NextResponse.json({ error: "modèle invalide" }, { status: 400 });
  }

  const sb = await createClient();
  const { data: client, error: cliErr } = await sb
    .from("clients")
    .select("denomination, mois_signature, jour_cloture, mois_cloture")
    .eq("id", id)
    .single();
  if (cliErr || !client) {
    return NextResponse.json({ error: "client introuvable" }, { status: 404 });
  }

  // Dirigeant : premier contact lié (prénom + nom stockés séparément).
  const { data: links } = await sb
    .from("client_contacts")
    .select("contacts(prenom, nom)")
    .eq("client_id", id)
    .limit(1);
  const dir = (links?.[0]?.contacts ?? null) as { prenom: string | null; nom: string | null } | null;

  try {
    const anneeRaw = parseInt(sp.get("annee") ?? "", 10);
    const buffer = generateAttestationCA(
      {
        denomination: client.denomination,
        dirigeant_prenom: dir?.prenom ?? null,
        dirigeant_nom: dir?.nom ?? null,
        mois_signature: (client.mois_signature ?? null) as string | null,
        jour_cloture: client.jour_cloture == null ? null : Number(client.jour_cloture),
        mois_cloture: client.mois_cloture == null ? null : Number(client.mois_cloture),
      },
      {
        date_debut: (sp.get("date_debut") ?? "").trim(),
        date_fin: (sp.get("date_fin") ?? "").trim(),
        motif: (sp.get("motif") ?? "").trim(),
        annee: Number.isNaN(anneeRaw) ? new Date().getFullYear() : anneeRaw,
        ca: (sp.get("ca") ?? "").trim(),
      }
    );

    const denomClean = client.denomination.replace(/[\/\\:*?"<>|]/g, "").trim();
    const annee = Number.isNaN(anneeRaw) ? new Date().getFullYear() : anneeRaw;
    const filename = `${denomClean} - Attestation CA ${annee} Draft.docx`;
    const encoded = encodeURIComponent(filename);

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (e) {
    console.error("Attestation generation failed:", e);
    return NextResponse.json(
      { error: "Erreur de génération de l'attestation", details: String(e) },
      { status: 500 }
    );
  }
}
