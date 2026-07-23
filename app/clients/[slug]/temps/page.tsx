import { notFound } from "next/navigation";
import TempsCard from "../temps-card";
import { loadClient } from "../_data";

export const dynamic = "force-dynamic";

/**
 * Onglet "Temps" : saisie et suivi des temps passés sur le dossier.
 * Isolé dans son propre onglet (et non fondu dans Honoraires) pour laisser
 * la place à l'analyse de rentabilité à venir.
 */
export default async function TempsTab({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const client = await loadClient(slug);
  if (!client) notFound();

  return (
    <div className="space-y-5">
      <TempsCard clientId={client.id} honorairesCompta={client.honoraires_compta} />
    </div>
  );
}
