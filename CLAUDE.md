# CLAUDE.md — MoonCRM

## Contexte

CRM interne de **MOON Expertise** (cabinet d'expertise comptable, Paris). Réécriture de la base Notion « Onboarding clients » en application web. Utilisateur principal : Benjamin Perez, expert-comptable dirigeant. **Tout en français** : réponses, UI, commits, documentation.

## Stack

- **Next.js 15** (App Router) + **React 19** + TypeScript strict
- **Supabase** : Postgres + Auth + RLS (`@supabase/ssr`, client/server/middleware dans `lib/supabase/`)
- **Tailwind 3.4** — 3 thèmes : clair / dark / navy
- Librairies clés : `lucide-react` (icônes), `sonner` (toasts), `@dnd-kit` (kanban pipeline), `recharts` (finance), `docxtemplater` + `pizzip` (génération LDM & attestations), `zod`, `canvas-confetti`

## Commandes

```
npm run dev         # serveur de dev
npm run build       # build production
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

Scripts data (`node --env-file=.env.local --import tsx`) : `import-notion`, `backfill-echeances`, `backfill-forfaits`, `backfill-onboarding`, `sync-mandatory`, `cleanup-legacy`, `convert-ldm-templates`.

## Déploiement

- **Pas d'auto-deploy GitHub.** Déploiement manuel : `vercel --prod --archive=tgz` (le flag `--archive=tgz` est **obligatoire**, les uploads classiques coupent).

## Structure

- `app/` — ~36 pages App Router :
  - `/` (dashboard), `pipeline`, `clients` (+ `[slug]` : fiche, `exercice`, `onboarding`, `obligations`, `honoraires`, `temps`, `historique`, + `nouveau`)
  - `onboarding` (+ `matrice`, `parametrage`, moteur `parcours-engine.ts`), `obligations` (+ `[tracker]`)
  - `missions/` : `caa`, `creations`, `exceptionnelles`, `ir`, `pilotage`
  - `temps` (+ `planning`), `facturation`, `finance`, `honoraires`, `documents`, `apports`, `en-attente`
  - `parametrage/` (: `emails`, `temps-activites`, `tva-tags`), `admin/` (`users`, `roles`), `login`, `reset-password`
  - `app/_components/` — composants partagés : `app-shell`, `sidebar`, `page-header`, `picker`, `form-modal`, `confirm-modal`, `command-palette`, `ui.tsx`, hooks de sélection/préférences
  - `app/api/` — `chat`, `clients`, `documents`
- `lib/` — moteurs métier : `obligations-engine`, `echeances-engine`, `ldm-generator`, `ldm-data`, `ldm-phrases`, `attestation-generator`, `permissions`, `auth`, `audit-log`, `inpi`, `billable`… + `lib/types/database.ts` (types Supabase)
- `supabase/migrations/` — 92+ migrations (`0001_schema.sql` → `0092_fix_default_statut_rejetee.sql`)
- `docs/` — **`AUDIT_DESIGN_RULES.md` : règles design consolidées à respecter impérativement** (tokens couleur, focus, z-index, badges statut, pickers, modales, toasts, a11y, 3 thèmes) ; `AUDIT_FINDINGS.md` (constats d'audit antérieurs) ; `AUDIT_MASTER_PROMPT.md`
- `scripts/` — imports Notion et backfills

## Conventions

- **Design** : suivre `docs/AUDIT_DESIGN_RULES.md` — tokens (`bg-card`, `text-muted-foreground`…), un seul `--ring`, échelle z-index nommée, badges statut centralisés dans `lib/utils.ts` (EN_COURS = sky partout), pastille d'urgence amber=à traiter / rose=en retard, `ModalShell` + focus-trap, sonner unique, lucide-react uniquement, vérifier chaque livrable dans les 3 thèmes.
- **Git sous PowerShell** : les here-strings `@'…'@` cassent avec `git commit -m` → toujours écrire le message dans un fichier puis `git commit -F <fichier>`.
- **Méthode** : proposer avant de coder toute évolution structurante ; audits en lecture seule jusqu'à validation du backlog.

## État au 26/07/2026

- Branche `main` propre ; dernier commit `0d8512d` (génération en masse des LDM, page Documents + ZIP).
- Saisie des temps : pages `temps/` + `temps/planning` livrées (migration `0080_time_tracking`).
- SSO Microsoft Entra : code livré (provider Azure Supabase), configuration Azure/Supabase/Vercel en attente.
- Génération documents : LDM (unitaire + masse/ZIP), attestations de CA.
