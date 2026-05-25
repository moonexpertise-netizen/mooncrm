-- ============================================================================
-- Correction MRR/ARR : on ne compte un montant de forfait que si le flag
-- type_honos_* indique "Facturés".
--
-- Avant : forfait_bilan et honoraires_jur étaient ajoutés au MRR/ARR dès
--         qu'ils étaient > 0, indépendamment du flag. Bug : un montant
--         stocké en DB (résidu d'une saisie antérieure) s'ajoutait au MRR
--         même si l'utilisateur avait passé le flag à "Inclus", "Non
--         souscrit" ou vide.
--
-- Après : on n'ajoute le montant que si type_honos_bilans = 'Facturés'
--         (resp. type_honos_jur = 'Facturés'). Cohérent avec l'UI qui
--         masque le champ montant tant que le flag n'est pas "Facturés".
--
-- forfait_pilotage et le bloc tdb_periode/tdb_honos_periode ne sont pas
-- affectés (la logique CASE sur tdb_periode était déjà correcte).
-- ============================================================================

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
