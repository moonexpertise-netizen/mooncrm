"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, PIPELINE_COLORS } from "@/lib/utils";
import { useAlert, useConfirm } from "@/app/_components/confirm-modal";
import {
  reconduireAnnee,
  setPipelineStatut,
  setRegime,
  setTvaMode,
  toggleSubscription,
  type PipelineStatut,
  type Regime,
  type TypeObligation,
} from "./actions";

type Tva = "TVA_MENSUELLE" | "TVA_TRIMESTRIELLE" | "TVA_ANNUELLE_CA12" | "TVA_NON_SOUMIS";

const TYPE_LABEL: Record<TypeObligation, string> = {
  TVA_MENSUELLE: "Mensuelle",
  TVA_TRIMESTRIELLE: "Trimestrielle",
  TVA_ANNUELLE_CA12: "Annuelle",
  TVA_NON_SOUMIS: "Non soumis",
  TVS: "TVS",
  IS_ACOMPTE: "IS - Acomptes",
  IS_SOLDE: "IS - Solde",
  CVAE: "CVAE",
  CVAE_ACOMPTE: "CVAE - Acomptes",
  CFE: "CFE",
  DAS2: "DAS2",
  DECL_2561: "IFU 2561",
  DECL_2777: "Flat-tax 2777",
  OSS: "OSS (Guichet unique)",
  DES: "DES",
  COMPTA: "Compta",
  LIASSE_PLAQUETTE: "Liasse / Plaquette",
  AGO_DEPOT: "AGO / dépôt",
  DEPOT_COMPTES: "Dépôt comptes",
  FACTURATION_JUR: "Facturation Jur",
  ETAT_CREATION: "État création",
};

const TVA_MODES: Tva[] = [
  "TVA_MENSUELLE",
  "TVA_TRIMESTRIELLE",
  "TVA_ANNUELLE_CA12",
  "TVA_NON_SOUMIS",
];

const PIPELINE_VALUES: PipelineStatut[] = [
  "1 - Tally à envoyer",
  "2 - Tally à compléter",
  "3 - PC à préparer",
  "4 - PC envoyée",
  "5 - PC acceptée",
  "6 - LDM envoyée",
  "7 - LDM signée",
  "Z - Interne",
  "Z - Perdu dans l'espace",
  "Z - Prospect perdu",
  "Z - Résiliée",
];

// Ordre métier MOON : bilan annuel → IS → autres taxes → déclarations.
// CFE retirée (non gérée), CVAE solde retiré (vérif manuelle).
// IS Acomptes retiré : auto-activé pour tout dossier en régime IS.
const BILAN_TYPES: TypeObligation[] = ["LIASSE_PLAQUETTE", "DAS2", "AGO_DEPOT"];
const IS_TYPES: TypeObligation[] = ["IS_SOLDE"];
const TAXES_TYPES: TypeObligation[] = ["TVS", "CVAE_ACOMPTE"];
const DECL_TYPES: TypeObligation[] = ["DECL_2777", "DECL_2561", "OSS", "DES"];

export default function ParametrageCard({
  clientId,
  annee,
  activeTypes,
  regime,
  pipelineStatut,
}: {
  clientId: string;
  annee: number;
  activeTypes: TypeObligation[];
  regime: Regime | null;
  pipelineStatut: PipelineStatut | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirm();
  const { alert, AlertDialog } = useAlert();
  const active = new Set(activeTypes);
  const currentTva = TVA_MODES.find((m) => active.has(m)) ?? null;

  function onToggle(type: TypeObligation) {
    const next = !active.has(type);
    startTransition(async () => {
      await toggleSubscription(clientId, type, annee, next);
      // Refresh : la matrice obligations + le hero "Obligations actives"
      // doivent refleter le toggle immediatement. La query serveur recree
      // / desactive les obligations periodiques.
      router.refresh();
    });
  }

  function onTvaChange(mode: Tva | null) {
    startTransition(async () => {
      await setTvaMode(clientId, annee, mode);
      // TVA_MENSUELLE vs TVA_TRIMESTRIELLE recree des subscriptions
      // periodiques cote serveur, visibles dans la matrice et l'echeancier.
      router.refresh();
    });
  }

  function onRegimeChange(r: Regime | null) {
    startTransition(async () => {
      await setRegime(clientId, annee, r);
      // IR/IS active/desactive IS_SOLDE, recree les obligations matrice,
      // change badges hero. Refresh imperatif.
      router.refresh();
    });
  }

  function onPipelineChange(p: PipelineStatut | null) {
    startTransition(async () => {
      await setPipelineStatut(clientId, p);
      // pipeline_statut impacte le hero badge + bucket clients/prospects
      // + kanban-position si on navigue ensuite.
      router.refresh();
    });
  }

  async function onReconduire() {
    const target = annee + 1;
    const ok = await confirm({
      title: `Reconduire ${annee} vers ${target} ?`,
      description: "La configuration et les obligations actives seront copiées sur l'année suivante.",
      confirmLabel: "Reconduire",
    });
    if (!ok) return;
    startTransition(async () => {
      const res = await reconduireAnnee(clientId, annee, target);
      const url = new URL(window.location.href);
      url.searchParams.set("year", String(target));
      router.push(url.pathname + url.search);
      await alert({
        title: "Reconduction effectuée",
        description: `${res.created} obligation${res.created > 1 ? "s" : ""} reconduite${
          res.created > 1 ? "s" : ""
        } vers ${target}.`,
      });
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-5",
        isPending && "opacity-60 pointer-events-none"
      )}
    >
      {ConfirmDialog}
      {AlertDialog}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Paramétrage {annee}</h2>
        <button
          onClick={onReconduire}
          disabled={isPending}
          className="text-xs px-2 py-1 rounded border border-zinc-300 hover:bg-zinc-100 text-zinc-700"
        >
          Reconduire vers {annee + 1}
        </button>
      </div>

      {/* Statut pipeline (client-level) */}
      <Section title="Statut pipeline">
        <div className="flex flex-wrap gap-2">
          {PIPELINE_VALUES.map((p) => (
            <RadioPill
              key={p}
              label={p}
              active={pipelineStatut === p}
              colorWhenActive={PIPELINE_COLORS[p]}
              onClick={() => onPipelineChange(pipelineStatut === p ? null : p)}
            />
          ))}
        </div>
      </Section>

      {/* Régime fiscal (par année) */}
      <Section title="Régime fiscal">
        <div className="flex flex-wrap gap-2">
          <RadioPill
            label="Non paramétré"
            active={regime === null}
            onClick={() => onRegimeChange(null)}
          />
          <RadioPill label="IR" active={regime === "IR"} onClick={() => onRegimeChange("IR")} />
          <RadioPill label="IS" active={regime === "IS"} onClick={() => onRegimeChange("IS")} />
        </div>
      </Section>

      {/* Régime TVA (par année) */}
      <Section title="Régime TVA">
        <div className="flex flex-wrap gap-2">
          <RadioPill
            label="Non paramétré"
            active={currentTva === null}
            onClick={() => onTvaChange(null)}
          />
          {TVA_MODES.map((m) => (
            <RadioPill
              key={m}
              label={TYPE_LABEL[m]}
              active={currentTva === m}
              onClick={() => onTvaChange(m)}
            />
          ))}
        </div>
      </Section>

      {/* Bilan annuel - Liasse / Plaquette, DAS2, AGO / dépôt */}
      <Section title="Bilan annuel">
        <div className="flex flex-wrap gap-2">
          {BILAN_TYPES.map((t) => (
            <TogglePill
              key={t}
              label={TYPE_LABEL[t]}
              active={active.has(t)}
              onClick={() => onToggle(t)}
            />
          ))}
        </div>
      </Section>

      {/* IS · visible seulement si régime IS */}
      {regime === "IS" && (
        <Section title="Impôt sur les sociétés">
          <div className="flex flex-wrap gap-2">
            {IS_TYPES.map((t) => (
              <TogglePill
                key={t}
                label={TYPE_LABEL[t]}
                active={active.has(t)}
                onClick={() => onToggle(t)}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Autres taxes - TVS, CVAE Acomptes */}
      <Section title="Autres taxes">
        <div className="flex flex-wrap gap-2">
          {TAXES_TYPES.map((t) => (
            <TogglePill
              key={t}
              label={TYPE_LABEL[t]}
              active={active.has(t)}
              onClick={() => onToggle(t)}
            />
          ))}
        </div>
      </Section>

      {/* Déclarations diverses - Flat-tax 2777, IFU 2561, OSS, DES */}
      <Section title="Déclarations diverses">
        <div className="flex flex-wrap gap-2">
          {DECL_TYPES.map((t) => (
            <TogglePill
              key={t}
              label={TYPE_LABEL[t]}
              active={active.has(t)}
              onClick={() => onToggle(t)}
            />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function RadioPill({
  label,
  active,
  onClick,
  colorWhenActive,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  colorWhenActive?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs border transition-colors",
        active
          ? colorWhenActive ?? "bg-zinc-900 text-white border-zinc-900"
          : "bg-white text-zinc-700 border-zinc-300 hover:bg-zinc-50"
      )}
    >
      {label}
    </button>
  );
}

function TogglePill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 pl-1.5 pr-3 py-1 rounded-md text-xs border transition-colors group/pill",
        active
          ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-medium hover:bg-emerald-100"
          : "bg-white border-zinc-300 text-zinc-600 hover:bg-zinc-50 hover:border-zinc-400"
      )}
    >
      {/* Case à cocher style harmonisé avec la matrice client + grille paramétrage */}
      <span
        className={cn(
          "relative inline-flex items-center justify-center w-4 h-4 rounded border overflow-hidden shrink-0",
          active ? "border-emerald-500" : "border-zinc-300"
        )}
      >
        {/* Calque unique style "coché" - opacity 100 si actif, 60% au survol sinon */}
        <span
          className={cn(
            "absolute inset-0 inline-flex items-center justify-center",
            "bg-emerald-500/95 text-white transition-opacity duration-100",
            active ? "opacity-100" : "opacity-0 group-hover/pill:opacity-60"
          )}
        >
          <span className="text-[11px] font-bold leading-none">✓</span>
        </span>
      </span>
      <span>{label}</span>
    </button>
  );
}
