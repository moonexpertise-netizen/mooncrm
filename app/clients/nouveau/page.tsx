import Link from "next/link";
import NouveauClientForm from "./form";

export default function NouveauClientPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <Link
          href="/clients"
          className="text-sm text-muted-foreground hover:text-[hsl(var(--gold))] transition-colors"
        >
          ← Clients
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">Nouveau client</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cherche l'entreprise par nom ou SIREN dans l'annuaire public, ou saisis manuellement.
        </p>
      </div>
      <NouveauClientForm />
    </div>
  );
}
