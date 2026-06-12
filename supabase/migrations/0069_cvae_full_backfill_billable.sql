-- ============================================================================
-- CVAE backfill complet : pour TOUS les clients billable × les annees
-- couvertes par les trackers, independamment de client_year_config.
--
-- Probleme detecte avec 0068 : on ne backfillait que les (client, annee) avec
-- un client_year_config existant. Beaucoup de clients facturables n'ont pas
-- forcement de row client_year_config pour chaque annee (notamment 2025),
-- du coup leurs cases CVAE restaient en "-" (= pas de sub active = virtuelle
-- avec pas d'option de saisie).
--
-- Solution : backfill direct sur (billable client) X (annee in [2023, 2027])
-- sans dependance a client_year_config.
--
-- Regle "billable" = isClientBillable() de lib/billable.ts.
--
-- Idempotent via ON CONFLICT DO UPDATE.
-- ============================================================================

-- 1. Insert / update : pour chaque (billable client, annee), ensure CVAE +
--    CVAE_ACOMPTE existent et sont actives. ON CONFLICT reactive si une sub
--    inactive existe (ancien parametrage qui aurait desactive CVAE).
insert into public.obligation_subscriptions (client_id, type, annee, actif)
select c.id, t.type, y.annee, true
from public.clients c
cross join (
  -- Plage couverte par les trackers (cf. UI : onglets 2024 / 2025 / 2026).
  -- Etendue a +/- 1 pour le tampon (signature retroactive ou annee future).
  select generate_series(2023, 2027)::smallint as annee
) y
cross join (
  values ('CVAE'::type_obligation), ('CVAE_ACOMPTE'::type_obligation)
) as t(type)
where (
  c.pipeline_statut in ('7 - LDM signée', 'Z - Interne', 'Z - Sous-traitance')
  or c.origine in ('5 - Sous-traitance', 'Z - Sous-traitance')
)
on conflict (client_id, type, annee) do update set actif = true;

-- 2. Materialise les lignes d'obligations (statut A_FAIRE) pour chaque sub
--    CVAE / CVAE_ACOMPTE active. Sans ca, les cellules sont "virtuelles" et
--    on ne peut PAS les selectionner pour un bulk-update (la selection
--    Excel-like ignore les cellules sans obligationId DB).
--
--    Periodes generees :
--      - CVAE : 1 ligne par sub avec periode = annee (ex. "2025")
--      - CVAE_ACOMPTE : 2 lignes par sub (acpt 06 = "A-06-2025", acpt 09 =
--        "A-09-2025")

-- 2.a CVAE solde : 1 row par sub
insert into public.obligations (subscription_id, client_id, type, periode, annee, statut_logique, statut_detail)
select s.id, s.client_id, s.type, s.annee::text, s.annee, 'A_FAIRE'::statut_logique, null
from public.obligation_subscriptions s
where s.type = 'CVAE' and s.actif = true
on conflict (subscription_id, periode) do nothing;

-- 2.b CVAE_ACOMPTE : 2 rows par sub (A-06 + A-09)
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
