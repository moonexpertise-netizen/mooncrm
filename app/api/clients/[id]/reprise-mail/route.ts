import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateLettreReprise, type RepriseExtra } from "@/lib/ldm-generator";
import { docxToPdf, DocxToPdfError } from "@/lib/docx-to-pdf";
import { buildEml, dispositionPieceJointe } from "@/lib/eml";

/**
 * POST /api/clients/:id/reprise-mail
 * body { lettre: RepriseExtra, mail: { to, subject, body } }
 *
 * Renvoie UN fichier .eml contenant le brouillon Outlook ET le courrier de
 * reprise signé, déjà en pièce jointe. Un double-clic ouvre le message prêt à
 * partir : plus rien à joindre à la main.
 *
 * POURQUOI cette route plutôt qu'un mailto : un lien mailto transite par
 * l'URL et ne peut porter aucun fichier. Le .eml, lui, embarque le PDF.
 *
 * Tout se fait en un aller-retour — génération du .docx, conversion PDF,
 * assemblage du message — pour que le navigateur n'ait qu'un téléchargement à
 * déclencher.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  let payload: {
    lettre?: Partial<RepriseExtra>;
    mail?: { to?: string; subject?: string; body?: string };
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }

  const subject = (payload.mail?.subject ?? "").trim();
  const corps = payload.mail?.body ?? "";
  if (!subject) return NextResponse.json({ error: "objet manquant" }, { status: 400 });
  if (!corps.trim()) return NextResponse.json({ error: "message vide" }, { status: 400 });

  const { data: client, error } = await sb
    .from("clients")
    .select("denomination, fin_mission_date")
    .eq("id", id)
    .maybeSingle();
  if (error || !client) {
    return NextResponse.json({ error: "dossier introuvable" }, { status: 404 });
  }

  const l = payload.lettre ?? {};
  const extra: RepriseExtra = {
    cabinet: (l.cabinet ?? "").trim(),
    expert: (l.expert ?? "").trim(),
    adresse: (l.adresse ?? "").trim(),
    code_postal: (l.code_postal ?? "").trim(),
    ville: (l.ville ?? "").trim(),
    interlocuteur: (l.interlocuteur ?? "Confrère").trim(),
    type_mission: (l.type_mission ?? "").trim(),
    cloture: (l.cloture ?? "").trim(),
    date_debut: (l.date_debut ?? "").trim(),
    date_reprise: (l.date_reprise ?? "").trim(),
  };

  try {
    const docx = generateLettreReprise({ denomination: client.denomination }, extra);

    const denomClean = client.denomination.replace(/[\/\\:*?"<>|]/g, "").trim();
    const annee = client.fin_mission_date
      ? new Date(client.fin_mission_date).getFullYear()
      : new Date().getFullYear();
    const nomPdf = `${denomClean} - Lettre de reprise ${annee}.pdf`;

    const pdf = await docxToPdf(docx, `${denomClean} - Lettre de reprise ${annee}.docx`);

    const eml = buildEml({
      to: (payload.mail?.to ?? "").trim(),
      subject,
      body: corps,
      pieces: [{ nom: nomPdf, contenu: pdf, type: "application/pdf" }],
    });

    const nomEml = `${denomClean} - Reprise deontologique.eml`;
    return new NextResponse(eml as unknown as BodyInit, {
      headers: {
        "Content-Type": "message/rfc822",
        "Content-Disposition": dispositionPieceJointe(nomEml),
      },
    });
  } catch (e) {
    console.error("Reprise mail generation failed:", e);
    if (e instanceof DocxToPdfError) {
      return NextResponse.json(
        { error: "Conversion PDF impossible", details: e.message },
        { status: e.status === 401 ? 401 : 500 }
      );
    }
    return NextResponse.json(
      { error: "Erreur de génération", details: String(e) },
      { status: 500 }
    );
  }
}
