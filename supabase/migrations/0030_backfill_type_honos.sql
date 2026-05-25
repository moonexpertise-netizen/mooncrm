-- ============================================================================
-- Backfill des flags type_honos_* pour les dossiers importés avant l'ajout
-- de ces colonnes (migrations 0018, 0025, 0028).
--
-- Logique : si un dossier a un montant > 0 saisi sur un forfait, c'est qu'il
-- a forcément été "Facturés" (sinon le montant aurait été 0). On force donc
-- le flag correspondant à 'Facturés' quand il est null ET que le montant
-- est positif.
--
-- Pour le pilotage (TDB) : si tdb_honos_periode > 0 et tdb_periode est null,
-- on suppose "Mensuel" par défaut (cas le plus courant chez MOON). À
-- ajuster manuellement sur les dossiers où c'était trimestriel.
-- ============================================================================

update public.clients
set type_honos_bilans = 'Facturés'::type_honos_bilans_t
where type_honos_bilans is null
  and coalesce(forfait_bilan, 0) > 0;

update public.clients
set type_honos_jur = 'Facturés'::type_honos_jur_t
where type_honos_jur is null
  and coalesce(honoraires_jur, 0) > 0;

update public.clients
set type_honos_creation = 'Facturés'::type_honos_oneshot_t
where type_honos_creation is null
  and coalesce(honoraires_creation, 0) > 0;

update public.clients
set type_honos_reprise = 'Facturés'::type_honos_oneshot_t
where type_honos_reprise is null
  and coalesce(honoraires_reprise, 0) > 0;

update public.clients
set tdb_periode = 'Mensuel'::tdb_periode_t
where tdb_periode is null
  and coalesce(tdb_honos_periode, 0) > 0;
