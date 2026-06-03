-- ============================================================================
-- 0065 - Normaliser le format de periode pour les obligations a format dedie
-- ============================================================================
--
-- Probleme : certaines obligations ont ete creees / importees avec un format
-- de periode incoherent par rapport au code metier actuel. Concretement :
--
--   IS_ACOMPTE     : code attend "A-MM-YYYY" (ex. "A-06-2026")
--                    Mais des lignes legacy sont au format "YYYY-MM" (ex.
--                    "2026-06"). Le tracker mappe via la cle (client, type,
--                    periode) avec le bon format -> il ne voit PAS ces
--                    zombies. Mais ils restent visibles dans la page
--                    /obligations/echeances qui rend `periode` brut.
--
--   CVAE_ACOMPTE   : meme structure que IS_ACOMPTE -> meme normalisation
--
--   TVA_ANNUELLE_CA12 : code attend "A-07-YYYY", "A-12-YYYY" ou "S-YYYY".
--                    Legacy potentiel : "YYYY".
--
-- Strategie :
--   1. Convertir "YYYY-MM" -> "A-MM-YYYY" pour IS_ACOMPTE et CVAE_ACOMPTE
--   2. Si un doublon existe (vraie obligation au bon format ET zombie au
--      mauvais format pour le meme client+type+annee+mois), on garde celle
--      qui n'est PAS en A_FAIRE (sinon arbitraire = bon format).
--   3. TVA_ANNUELLE_CA12 : convertir "YYYY" tout court -> "S-YYYY" (solde).
--
-- Cette migration est idempotente : elle ignore les lignes deja au bon
-- format.
-- ============================================================================

begin;

-- ---------- IS_ACOMPTE : "YYYY-MM" -> "A-MM-YYYY" -----------------------
-- D'abord, gerer les vrais doublons (meme client, meme type, meme periode
-- finale). On supprime la version en A_FAIRE/NON_APPLICABLE et on garde la
-- version la plus avancee (TERMINE > EN_COURS > A_FAIRE).

with zombies as (
  select id, client_id, type, periode, annee, statut_logique,
         -- Conversion "YYYY-MM" -> "A-MM-YYYY"
         'A-' || substring(periode from 6 for 2) || '-' || substring(periode from 1 for 4) as periode_normalisee
  from public.obligations
  where type in ('IS_ACOMPTE', 'CVAE_ACOMPTE')
    and periode ~ '^[0-9]{4}-[0-9]{2}$'
),
ranked as (
  select
    z.id as zombie_id,
    z.statut_logique as zombie_statut,
    o.id as good_id,
    o.statut_logique as good_statut
  from zombies z
  left join public.obligations o
    on o.client_id = z.client_id
   and o.type = z.type
   and o.periode = z.periode_normalisee
),
-- Pour chaque zombie qui a un pendant au bon format, decide qui supprimer
suppress as (
  select
    case
      -- Si pendant n'existe pas -> on garde le zombie (mais renomme apres)
      when good_id is null then null
      -- Zombie deja terminee mais pendant pas -> garde zombie, supprime pendant
      when zombie_statut in ('TERMINE', 'NON_APPLICABLE')
        and good_statut not in ('TERMINE', 'NON_APPLICABLE') then good_id
      -- Sinon : on supprime le zombie
      else zombie_id
    end as id_to_delete
  from ranked
)
delete from public.obligations
where id in (select id_to_delete from suppress where id_to_delete is not null);

-- Maintenant on renomme les zombies restants (= ceux qui n'avaient PAS de
-- pendant au bon format). Le suppress ci-dessus a deja vire ceux qui en
-- avaient un, donc tout ce qui matche encore peut etre renomme sans risque
-- d'unique violation.
update public.obligations
set periode = 'A-' || substring(periode from 6 for 2) || '-' || substring(periode from 1 for 4)
where type in ('IS_ACOMPTE', 'CVAE_ACOMPTE')
  and periode ~ '^[0-9]{4}-[0-9]{2}$';

-- ---------- TVA_ANNUELLE_CA12 : "YYYY" -> "S-YYYY" ---------------------
-- Meme strategie : si un solde au bon format existe deja, on supprime le
-- zombie, sinon on le renomme.

with zombies as (
  select id, client_id, type, periode, statut_logique,
         'S-' || periode as periode_normalisee
  from public.obligations
  where type = 'TVA_ANNUELLE_CA12'
    and periode ~ '^[0-9]{4}$'
),
ranked as (
  select
    z.id as zombie_id,
    z.statut_logique as zombie_statut,
    o.id as good_id,
    o.statut_logique as good_statut
  from zombies z
  left join public.obligations o
    on o.client_id = z.client_id
   and o.type = z.type
   and o.periode = z.periode_normalisee
),
suppress as (
  select
    case
      when good_id is null then null
      when zombie_statut in ('TERMINE', 'NON_APPLICABLE')
        and good_statut not in ('TERMINE', 'NON_APPLICABLE') then good_id
      else zombie_id
    end as id_to_delete
  from ranked
)
delete from public.obligations
where id in (select id_to_delete from suppress where id_to_delete is not null);

update public.obligations
set periode = 'S-' || periode
where type = 'TVA_ANNUELLE_CA12'
  and periode ~ '^[0-9]{4}$';

commit;
