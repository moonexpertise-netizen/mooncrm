import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildEml, dispositionPieceJointe } from "@/lib/eml";
import { nomFichierEml } from "@/lib/mail-templates";

/**
 * POST /api/clients/:id/mail
 * body { to, cc?, subject, body, nomModele }
 *
 * Renvoie un fichier .eml (brouillon Outlook) pour UN dossier.
 *
 * Le corps arrive DÉJÀ substitué : la modale de la fiche client applique
 * `fillTemplate` puis laisse Benjamin relire et retoucher le texte. On envoie
 * donc exactement ce qui était affiché — pas de seconde substitution côté
 * serveur qui pourrait diverger de l'aperçu.
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
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    nomModele?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }

  const subject = (payload.subject ?? "").trim();
  const body = payload.body ?? "";
  if (!subject) {
    return NextResponse.json({ error: "objet manquant" }, { status: 400 });
  }
  if (!body.trim()) {
    return NextResponse.json({ error: "corps du message vide" }, { status: 400 });
  }

  // Lecture du dossier (RLS applique les droits) : sert au nom de fichier et
  // vérifie au passage que l'utilisateur a bien accès à ce dossier.
  const { data: client, error } = await sb
    .from("clients")
    .select("denomination")
    .eq("id", id)
    .maybeSingle();
  if (error || !client) {
    return NextResponse.json({ error: "dossier introuvable" }, { status: 404 });
  }

  const eml = buildEml({
    to: (payload.to ?? "").trim(),
    cc: (payload.cc ?? "").trim() || undefined,
    subject,
    body,
  });
  const filename = nomFichierEml(client.denomination, payload.nomModele ?? "Mail");

  return new NextResponse(eml as unknown as BodyInit, {
    headers: {
      "Content-Type": "message/rfc822",
      "Content-Disposition": dispositionPieceJointe(filename),
    },
  });
}
