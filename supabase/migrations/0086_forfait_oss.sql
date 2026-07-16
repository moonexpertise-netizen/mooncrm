-- ============================================================================
-- Forfait "Guichet unique - OSS" — calqué sur le forfait pilotage, mais
-- TOUJOURS trimestriel (le guichet unique / OSS se déclare trimestriellement).
--
-- Modèle (miroir du pilotage tdb_*) :
--   · oss_periode          text  ∈ {'Trimestriel','Non souscrit'} (null = non renseigné)
--   · oss_honos_trimestre  numeric  montant PAR TRIMESTRE (source de vérité, saisi)
--   · forfait_oss          numeric  GENERATED = équivalent MENSUEL
--        · Trimestriel  → oss_honos_trimestre / 3
--        · sinon        → 0
--
-- MRR / ARR intègrent l'OSS au même titre que le pilotage. Comme une colonne
-- GENERATED ne peut pas référencer une autre colonne GENERATED (forfait_oss),
-- la formule est INLINÉE dans mrr/arr (comme déjà fait pour le pilotage).
-- On repart de la définition mrr/arr de 0029 en y ajoutant le terme OSS.
-- ============================================================================

-- 1. Colonnes source
alter table public.clients
  add column if not exists oss_periode text
    check (oss_periode is null or oss_periode in ('Trimestriel', 'Non souscrit'));

alter table public.clients
  add column if not exists oss_honos_trimestre numeric(10,2) not null default 0;

-- 2. Équivalent mensuel dérivé (pour la fiche, la grille, la LDM)
alter table public.clients
  add column if not exists forfait_oss numeric(10,2) generated always as (
    case
      when oss_periode = 'Trimestriel' then coalesce(oss_honos_trimestre, 0) / 3.0
      else 0
    end
  ) stored;

-- 3. MRR / ARR recalculés (formule 0029 + terme OSS trimestriel)
alter table public.clients drop column if exists mrr;
alter table public.clients drop column if exists arr;

alter table public.clients
  add column mrr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0)
    + (case
        when tdb_periode = 'Mensuel'::tdb_periode_t then coalesce(tdb_honos_periode, 0)
        when tdb_periode = 'Trimestriel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) / 3.0
        else 0
      end)
    + (case
        when oss_periode = 'Trimestriel' then coalesce(oss_honos_trimestre, 0) / 3.0
        else 0
      end)
    + (case
        when type_honos_bilans = 'Facturés'::type_honos_bilans_t
          then coalesce(forfait_bilan, 0) / 12.0
        else 0
      end)
    + (case
        when type_honos_jur = 'Facturés'::type_honos_jur_t
          then coalesce(honoraires_jur, 0) / 12.0
        else 0
      end)
  ) stored;

alter table public.clients
  add column arr numeric(10,2) generated always as (
    coalesce(honoraires_compta, 0) * 12
    + (case
        when tdb_periode = 'Mensuel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) * 12
        when tdb_periode = 'Trimestriel'::tdb_periode_t then coalesce(tdb_honos_periode, 0) * 4
        else 0
      end)
    + (case
        when oss_periode = 'Trimestriel' then coalesce(oss_honos_trimestre, 0) * 4
        else 0
      end)
    + (case
        when type_honos_bilans = 'Facturés'::type_honos_bilans_t
          then coalesce(forfait_bilan, 0)
        else 0
      end)
    + (case
        when type_honos_jur = 'Facturés'::type_honos_jur_t
          then coalesce(honoraires_jur, 0)
        else 0
      end)
  ) stored;
