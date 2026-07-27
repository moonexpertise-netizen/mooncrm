import { NextRequest, NextResponse } from "next/server";
import PizZip from "pizzip";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/auth";
import { buildEml, dispositionPieceJointe } from "@/lib/eml";
import {
  MAIL_CLIENT_SELECT,
  buildMailVars,
  fillTemplate,
  nomFichierEml,
  type MailClientRow,
  type MailDirigeant,
} from "@/lib/mail-templates";

/**
 * POST /api/documents/mails
 * body { templateId: string, clientIds: string[] }
 *
 * Génère un .eml par dossier à partir d'un modèle, et renvoie un ZIP —
 * pendant exact de /api/documents/bulk pour les LDM. Usage : campagnes de
 * relance (pièces manquantes, bilans), où on ne relit pas 30 mails un par un.
 * La substitution des variables se fait ici, dossier par dossier.
 */
export async function POST(request: NextRequest) {
  // Même garde que la génération de LDM en masse : l'UI grise le bouton, le
  // serveur le refuse aussi (le bouton grisé ne protège pas l'API).
  await requirePermission("edit_clients");

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non authentifié" }, { status: 401 });
  }

  let payload: { templateId?: string; clientIds?: string[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "corps invalide" }, { status: 400 });
  }
  const templateId = payload.templateId;
  const clientIds = Array.isArray(payload.clientIds) ? payload.clientIds.filter(Boolean) : [];
  if (!templateId) {
    return NextResponse.json({ error: "aucun modèle sélectionné" }, { status: 400 });
  }
  if (clientIds.length === 0) {
    return NextResponse.json({ error: "aucun dossier sélectionné" }, { status: 400 });
  }

  const [{ data: modele, error: tplErr }, { data: clients, error: cliErr }, { data: linksRaw }] =
    await Promise.all([
      sb.from("mail_templates").select("nom, objet, corps").eq("id", templateId).maybeSingle(),
      sb.from("clients").select(MAIL_CLIENT_SELECT).in("id", clientIds),
      sb
        .from("client_contacts")
        .select("client_id, contacts(nom, prenom, civilite, email, telephone)")
        .in("client_id", clientIds),
    ]);

  if (tplErr || !modele) {
    return NextResponse.json({ error: "modèle introuvable" }, { status: 404 });
  }
  if (cliErr) {
    return NextResponse.json({ error: cliErr.message }, { status: 500 });
  }

  // Dirigeant = 1er contact rattaché, comme partout ailleurs (LDM, attestation).
  const dirByClient = new Map<string, NonNullable<MailDirigeant>>();
  for (const l of (linksRaw ?? []) as unknown as Array<{
    client_id: string;
    contacts: {
      nom: string | null;
      prenom: string | null;
      civilite: string | null;
      email: string | null;
      telephone: string | null;
    } | null;
  }>) {
    if (!dirByClient.has(l.client_id) && l.contacts) dirByClient.set(l.client_id, l.contacts);
  }

  const maintenant = new Date();
  const zip = new PizZip();
  const nomsUtilises = new Set<string>();
  let generes = 0;
  const sansDestinataire: string[] = [];

  for (const raw of (clients ?? []) as unknown as Array<MailClientRow & { id: string }>) {
    const dirigeant = dirByClient.get(raw.id) ?? null;
    const vars = buildMailVars(raw, dirigeant, user.email ?? null, maintenant);
    const destinataire = dirigeant?.email ?? raw.email ?? "";
    if (!destinataire) sansDestinataire.push(raw.denomination);

    try {
      const eml = buildEml({
        to: destinataire,
        subject: fillTemplate(modele.objet, vars),
        body: fillTemplate(modele.corps, vars),
        date: maintenant,
      });

      let nom = nomFichierEml(raw.denomination, modele.nom);
      // Anti-collision : deux dossiers peuvent porter la même dénomination.
      let k = 2;
      while (nomsUtilises.has(nom)) {
        nom = nomFichierEml(`${raw.denomination} (${k++})`, modele.nom);
      }
      nomsUtilises.add(nom);
      zip.file(nom, eml);
      generes++;
    } catch (e) {
      console.error("[mails] génération échouée pour", raw.id, e);
    }
  }

  if (generes === 0) {
    return NextResponse.json({ error: "aucun mail généré" }, { status: 500 });
  }

  const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  const zipName = `Mails ${modele.nom} - ${generes} dossiers.zip`;

  return new NextResponse(out as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": dispositionPieceJointe(zipName),
      // Lu par le client pour avertir des dossiers sans adresse e-mail.
      "X-Sans-Destinataire": encodeURIComponent(sansDestinataire.join(", ")),
    },
  });
}
