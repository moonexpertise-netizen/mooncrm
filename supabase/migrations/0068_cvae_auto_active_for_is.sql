-- ============================================================================
-- CVAE auto-active pour TOUS les dossiers facturables (clients + internes +
-- sous-traitance), independamment du regime IR/IS.
--
-- Avant : CVAE_ACOMPTE etait dans la grille de parametrage (toggle manuel),
-- CVAE solde etait suivi manuellement (pas de tracker).
-- Maintenant : split en 2 trackers (cvae-acomptes + cvae-solde), auto-actives
-- pour tout client billable, comme IS_SOLDE/IS_ACOMPTE le sont pour les IS.
--
-- Regle "billable" = isClientBillable() en TS = pipeline_statut dans
-- ('7 - LDM signée', 'Z - Interne', 'Z - Sous-traitance') OU origine dans
-- ('5 - Sous-traitance', 'Z - Sous-traitance' legacy).
--
-- Si un dossier n'est pas concerne par la CVAE (CA < seuil ou CVAE N-1 <
-- 1 500 EUR), Benjamin pose un libelle "N/A" sur la ligne CVAE directement
-- dans le tracker.
--
-- Cette migration :
--   1. Pour chaque (client billable, annee) ou existe une client_year_config,
--      cree les subs CVAE + CVAE_ACOMPTE (actif=true) si absentes.
--   2. Reactive les subs CVAE existantes des billable (si jamais desactivees).
--
-- Idempotent : rejouable sans effet de bord.
-- ============================================================================

-- CTE : clients facturables (filtre identique a lib/billable.ts)
with billable as (
  select id
  from public.clients
  where pipeline_statut in ('7 - LDM signée', 'Z - Interne', 'Z - Sous-traitance')
     or origine in ('5 - Sous-traitance', 'Z - Sous-traitance')
)

-- 1. Insert subs CVAE + CVAE_ACOMPTE manquantes pour tout (billable, annee
--    avec client_year_config existant). On respecte le pattern existant :
--    une sub n'existe que si l'annee a deja une config (sinon le dossier
--    n'a pas encore d'obligations pour cette annee).
insert into public.obligation_subscriptions (client_id, type, annee, actif)
select cyc.client_id, t.type, cyc.annee, true
from public.client_year_config cyc
inner join billable b on b.id = cyc.client_id
cross join (values ('CVAE'::type_obligation), ('CVAE_ACOMPTE'::type_obligation)) as t(type)
where not exists (
  select 1 from public.obligation_subscriptions os
  where os.client_id = cyc.client_id
    and os.type = t.type
    and os.annee = cyc.annee
);

-- 2. Reactive les subs CVAE existantes des billable (si jamais elles
--    avaient ete desactivees manuellement / par l'ancienne logique IR)
update public.obligation_subscriptions os
set actif = true
from public.clients c
where os.client_id = c.id
  and os.type in ('CVAE', 'CVAE_ACOMPTE')
  and (
    c.pipeline_statut in ('7 - LDM signée', 'Z - Interne', 'Z - Sous-traitance')
    or c.origine in ('5 - Sous-traitance', 'Z - Sous-traitance')
  )
  and os.actif = false;
