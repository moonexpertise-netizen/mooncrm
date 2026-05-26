import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/app/_components/page-header";
import NouveauClientForm from "./form";

export default function NouveauClientPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <Link
        href="/clients"
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 transition-colors group"
      >
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-zinc-200 bg-white group-hover:border-zinc-300 group-hover:shadow-card transition-all">
          <ChevronLeft className="h-3.5 w-3.5" />
        </span>
        <span className="font-medium">Clients</span>
      </Link>
      <PageHeader
        title="Nouveau client"
        description="Cherche l'entreprise par nom ou SIREN dans l'annuaire public, ou saisis manuellement."
      />
      <NouveauClientForm />
    </div>
  );
}
