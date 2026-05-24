import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  generateLDM,
  type LDMTemplateKey,
  type LDMClientData,
  type LDMDirigeantData,
} from "@/lib/ldm-generator";

/**
 * GET /api/clients/:id/ldm?template=presentation|bnc
 * Génère la LDM, retourne le .docx en téléchargement.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const tpl = (request.nextUrl.searchParams.get("template") ?? "presentation") as LDMTemplateKey;
  if (tpl !== "presentation" && tpl !== "bnc") {
    return NextResponse.json({ error: "template invalide" }, { status: 400 });
  }

  const sb = await createClient();

  // 1. Client
  const { data: client, error: cliErr } = await sb
    .from("clients")
    .select(
      "denomination, activite, origine, adresse_siege, code_postal, ville, fin_mission_date, honoraires_compta, forfait_pilotage, forfait_bilan, honoraires_jur, honoraires_reprise, honoraires_creation, type_honos_bilans, type_honos_jur, tdb_periode, tdb_honos_periode, vitesse_tva"
    )
    .eq("id", id)
    .single();
  if (cliErr || !client) {
    return NextResponse.json({ error: "client introuvable" }, { status: 404 });
  }

  // 2. Dirigeant : on prend le premier contact lié au client.
  //    Prénom + nom sont stockés séparément en DB depuis la migration 0027.
  const { data: links } = await sb
    .from("client_contacts")
    .select("role, contact_id, contacts(nom, prenom, civilite)")
    .eq("client_id", id)
    .limit(1);

  let dirigeant: LDMDirigeantData = { civilite: null, prenom: null, nom: null };
  const link = links?.[0];
  if (link) {
    const c = (link as unknown as {
      contacts: { nom: string | null; prenom: string | null; civilite: string | null };
    }).contacts;
    dirigeant = {
      civilite: c?.civilite ?? null,
      prenom: c?.prenom ?? null,
      nom: c?.nom ?? null,
    };
  }

  const clientData: LDMClientData = {
    denomination: client.denomination,
    activite: client.activite,
    origine: client.origine,
    adresse_siege: client.adresse_siege,
    code_postal: client.code_postal,
    ville: client.ville,
    fin_mission_date: client.fin_mission_date,
    honoraires_compta: Number(client.honoraires_compta ?? 0),
    forfait_pilotage: Number(client.forfait_pilotage ?? 0),
    forfait_bilan: Number(client.forfait_bilan ?? 0),
    honoraires_jur: Number(client.honoraires_jur ?? 0),
    honoraires_reprise: Number(client.honoraires_reprise ?? 0),
    honoraires_creation: Number(client.honoraires_creation ?? 0),
    type_honos_bilans: (client.type_honos_bilans ?? null) as "Inclus" | "Facturés" | null,
    type_honos_jur: (client.type_honos_jur ?? null) as "Facturés" | "Inclus" | "Non souscrit" | null,
    tdb_periode: (client.tdb_periode ?? null) as "Mensuel" | "Trimestriel" | "Non souscrit" | null,
    tdb_honos_periode: Number(client.tdb_honos_periode ?? 0),
  };

  try {
    const buffer = generateLDM(tpl, clientData, dirigeant);
    // Slugify denomination for filename
    const slug = client.denomination.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_");
    const filename = `LDM_${tpl}_${slug}.docx`;

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("LDM generation failed:", e);
    return NextResponse.json(
      { error: "Erreur de génération LDM", details: String(e) },
      { status: 500 }
    );
  }
}
