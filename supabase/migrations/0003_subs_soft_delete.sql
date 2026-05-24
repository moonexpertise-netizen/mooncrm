-- ============================================================================
-- Soft-delete sur obligation_subscriptions
-- Ajoute un flag `actif`. Désactiver une sub conserve son historique
-- d'instances ; réactiver la rend de nouveau visible / éligible aux
-- futures générations.
-- ============================================================================

alter table public.obligation_subscriptions
  add column if not exists actif boolean not null default true;

create index if not exists idx_subs_actif
  on public.obligation_subscriptions(client_id, annee, actif);
