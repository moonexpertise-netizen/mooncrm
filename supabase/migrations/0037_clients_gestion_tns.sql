-- ============================================================================
-- Caractéristique "Gestion TNS" sur le dossier client.
--
-- Détermine si on inclut les 3 tâches d'onboarding TNS (Prévisionnel TNS,
-- Affiliation TNS) dans la checklist d'intégration du dossier.
--
-- Défaut selon forme juridique :
--   - SAS, SCI, SASU, SA  → false (assimilés salariés, pas de TNS)
--   - EI, EURL, SARL,
--     SELARL, SELARLU,
--     SELAS, SELASU       → true (dirigeants généralement TNS)
--   - autre (LMNP, ASSO,
--     SCM, AARPI…)        → null (l'utilisateur décide)
--
-- Modifiable depuis la fiche client (Détails CRM → Dates de gestion).
-- ============================================================================

alter table public.clients
  add column if not exists gestion_tns boolean;

-- Backfill : applique le défaut métier sur les dossiers existants
-- qui n'ont pas encore de valeur. Valeurs listées limitées à l'enum
-- forme_juridique existant (cf. migration 0001).
update public.clients
set gestion_tns = case
  when forme in ('SAS', 'SCI', 'SASU', 'SA') then false
  when forme in ('EI', 'INDIV', 'EURL', 'SARL', 'SELARL', 'SELAS') then true
  else null -- LMNP, ASSO, SCM, AARPI, SC… : Benjamin décide
end
where gestion_tns is null;

comment on column public.clients.gestion_tns is
  'Caractéristique TNS du dossier (modifiable). Conditionne les tâches d''onboarding TNS (Prévi TNS, Affiliation TNS). Défaut selon forme juridique mais éditable.';
