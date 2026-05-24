-- Nouveau champ : forfait_bilan (annuel), placé entre compta et pilotage dans l'UI.
-- Inclus dans la formule MRR/ARR comme honoraires_jur.

alter table public.clients
  add column if not exists forfait_bilan numeric(10,2) NOT NULL DEFAULT 0;

-- Recalcule mrr/arr en incluant forfait_bilan
alter table public.clients drop column if exists arr;
alter table public.clients drop column if exists mrr;

alter table public.clients
  add column mrr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0)
    + coalesce(forfait_pilotage, 0)
    + (coalesce(forfait_bilan, 0) / 12)
    + (coalesce(honoraires_jur, 0) / 12)
  ) stored;

alter table public.clients
  add column arr numeric(10,2) generated always as (
    (coalesce(honoraires_compta, 0) + coalesce(forfait_pilotage, 0)) * 12
    + coalesce(forfait_bilan, 0)
    + coalesce(honoraires_jur, 0)
  ) stored;
