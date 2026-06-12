-- ============================================================================
-- CVAE auto-active pour tout dossier en regime IS
--
-- Avant : CVAE_ACOMPTE etait dans la grille de parametrage (toggle manuel),
-- CVAE solde etait suivi manuellement (pas de tracker).
-- Maintenant : split en 2 trackers (cvae-acomptes + cvae-solde), auto-actives
-- pour tout client_year_config.regime = 'IS', comme IS_SOLDE et IS_ACOMPTE.
--
-- Cette migration :
--   1. Inserte des obligation_subscriptions CVAE + CVAE_ACOMPTE (actif=true)
--      pour chaque (client, annee) ou le client est en regime IS et n'a pas
--      deja la souscription.
--   2. Desactive CVAE + CVAE_ACOMPTE pour les clients en regime IR (au cas
--      ou des subs zombies existeraient).
--
-- Idempotent : peut etre rejouee sans effet de bord.
-- ============================================================================

-- 1. Auto-active CVAE + CVAE_ACOMPTE pour les (client, annee) en regime IS
insert into public.obligation_subscriptions (client_id, type, annee, actif)
select cyc.client_id, t.type, cyc.annee, true
from public.client_year_config cyc
cross join (values ('CVAE'::type_obligation), ('CVAE_ACOMPTE'::type_obligation)) as t(type)
where cyc.regime = 'IS'
  and not exists (
    select 1 from public.obligation_subscriptions os
    where os.client_id = cyc.client_id
      and os.type = t.type
      and os.annee = cyc.annee
  );

-- 2. Reactive les subs CVAE existantes pour les clients IS (si jamais elles
--    avaient ete desactivees manuellement avant ce changement)
update public.obligation_subscriptions os
set actif = true
from public.client_year_config cyc
where os.client_id = cyc.client_id
  and os.annee = cyc.annee
  and os.type in ('CVAE', 'CVAE_ACOMPTE')
  and cyc.regime = 'IS'
  and os.actif = false;

-- 3. Desactive CVAE + CVAE_ACOMPTE pour les clients en regime IR (coherence)
update public.obligation_subscriptions os
set actif = false
from public.client_year_config cyc
where os.client_id = cyc.client_id
  and os.annee = cyc.annee
  and os.type in ('CVAE', 'CVAE_ACOMPTE')
  and cyc.regime = 'IR'
  and os.actif = true;
