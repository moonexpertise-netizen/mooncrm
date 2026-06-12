-- ============================================================================
-- Fix : CVAE backfill doit respecter clients.debut_obligations (la "reprise
-- a partir de" de chaque dossier).
--
-- Bug : migration 0069 a backfille 2023-2027 pour TOUS les billable sans
-- regarder leur annee de prise en charge -> creation d'obligations CVAE
-- bidons sur 2023/2024 pour des dossiers repris seulement en 2025.
--
-- Cette migration :
--   1. SUPPRIME les obligations CVAE/CVAE_ACOMPTE pour annee < annee de
--      debut_obligations du client.
--   2. SUPPRIME les obligation_subscriptions CVAE/CVAE_ACOMPTE pour ces
--      memes (client, annee) -> evite de regenerer des cellules virtuelles
--      dans le tracker.
--   3. Re-insert (au cas ou) en respectant debut_obligations cette fois,
--      pour les billable. Idempotent : ON CONFLICT DO UPDATE.
--
-- A partir de maintenant, la regle est : CVAE existe a partir de
-- debut_obligations (inclus) jusqu'a 2027.
-- ============================================================================

-- 1. Supprime les obligations CVAE bidons (annee < debut_obligations)
delete from public.obligations o
using public.clients c
where o.client_id = c.id
  and o.type in ('CVAE', 'CVAE_ACOMPTE')
  and o.annee < extract(year from c.debut_obligations)::smallint;

-- 2. Supprime les subscriptions CVAE bidons (idem)
delete from public.obligation_subscriptions os
using public.clients c
where os.client_id = c.id
  and os.type in ('CVAE', 'CVAE_ACOMPTE')
  and os.annee < extract(year from c.debut_obligations)::smallint;

-- 3. Re-backfill correctement : pour chaque (billable, annee >= debut_obligations,
--    annee <= 2027), creer subs CVAE + CVAE_ACOMPTE.
insert into public.obligation_subscriptions (client_id, type, annee, actif)
select c.id, t.type, y.annee, true
from public.clients c
cross join (
  select generate_series(2023, 2027)::smallint as annee
) y
cross join (
  values ('CVAE'::type_obligation), ('CVAE_ACOMPTE'::type_obligation)
) as t(type)
where (
  c.pipeline_statut in ('7 - LDM signée', 'Z - Interne', 'Z - Sous-traitance')
  or c.origine in ('5 - Sous-traitance', 'Z - Sous-traitance')
)
and y.annee >= extract(year from c.debut_obligations)::smallint
on conflict (client_id, type, annee) do update set actif = true;

-- 4. Materialise les lignes obligations A_FAIRE pour les subs valides
--    (= post-debut). Les anciennes lignes bidons ont ete supprimees a
--    l'etape 1.

-- 4.a CVAE solde
insert into public.obligations (subscription_id, client_id, type, periode, annee, statut_logique, statut_detail)
select s.id, s.client_id, s.type, s.annee::text, s.annee, 'A_FAIRE'::statut_logique, null
from public.obligation_subscriptions s
where s.type = 'CVAE' and s.actif = true
on conflict (subscription_id, periode) do nothing;

-- 4.b CVAE_ACOMPTE (2 periodes : A-06 + A-09)
insert into public.obligations (subscription_id, client_id, type, periode, annee, statut_logique, statut_detail)
select s.id, s.client_id, s.type, p.periode, s.annee, 'A_FAIRE'::statut_logique, null
from public.obligation_subscriptions s
cross join lateral (
  values
    ('A-06-' || s.annee::text),
    ('A-09-' || s.annee::text)
) as p(periode)
where s.type = 'CVAE_ACOMPTE' and s.actif = true
on conflict (subscription_id, periode) do nothing;
