-- ============================================================================
-- Auto-facturation : tout ce qui est TERMINE et n'a pas encore d'etat_facturation
-- defini doit etre considere "a facturer" par defaut.
--
-- Backfill one-shot ET trigger DB pour les futurs UPDATE :
--   - ir_obligations  : statut_logique = TERMINE
--   - caa_obligations : statut_logique = TERMINE
--   - obligations     : type AGO_DEPOT ou LIASSE_PLAQUETTE en TERMINE
--   - missions_exceptionnelles : etat_mission = livree
--
-- Idempotent.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- BACKFILL one-shot
-- ----------------------------------------------------------------------------

update public.ir_obligations
set etat_facturation = 'a_facturer'
where statut_logique = 'TERMINE' and etat_facturation is null;

update public.caa_obligations
set etat_facturation = 'a_facturer'
where statut_logique = 'TERMINE' and etat_facturation is null;

update public.obligations
set etat_facturation = 'a_facturer'
where statut_logique = 'TERMINE'
  and etat_facturation is null
  and type in ('AGO_DEPOT', 'LIASSE_PLAQUETTE');

update public.missions_exceptionnelles
set etat_facturation = 'a_facturer'
where etat_mission = 'livree' and etat_facturation is null;

-- ----------------------------------------------------------------------------
-- TRIGGER : auto-set sur passage en TERMINE (ir_obligations, caa_obligations,
-- obligations). On ne touche pas si etat_facturation est deja defini (l'user
-- a pu choisir "sans_facture" ou "facturee" explicitement).
-- ----------------------------------------------------------------------------

create or replace function public.auto_facturation_on_termine()
returns trigger
language plpgsql
as $$
begin
  if new.statut_logique = 'TERMINE'
     and (old.statut_logique is null or old.statut_logique <> 'TERMINE')
     and new.etat_facturation is null then
    new.etat_facturation := 'a_facturer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ir_obligations_auto_facturation on public.ir_obligations;
create trigger trg_ir_obligations_auto_facturation
  before update on public.ir_obligations
  for each row execute function public.auto_facturation_on_termine();

drop trigger if exists trg_caa_obligations_auto_facturation on public.caa_obligations;
create trigger trg_caa_obligations_auto_facturation
  before update on public.caa_obligations
  for each row execute function public.auto_facturation_on_termine();

-- Pour obligations (AGO/Bilan), on filtre les types concernes dans le trigger
create or replace function public.auto_facturation_on_termine_obligations()
returns trigger
language plpgsql
as $$
begin
  if new.statut_logique = 'TERMINE'
     and (old.statut_logique is null or old.statut_logique <> 'TERMINE')
     and new.etat_facturation is null
     and new.type in ('AGO_DEPOT', 'LIASSE_PLAQUETTE') then
    new.etat_facturation := 'a_facturer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_obligations_auto_facturation on public.obligations;
create trigger trg_obligations_auto_facturation
  before update on public.obligations
  for each row execute function public.auto_facturation_on_termine_obligations();

-- Pour missions_exceptionnelles : auto-facturation au passage en "livree"
create or replace function public.auto_facturation_on_livree_mex()
returns trigger
language plpgsql
as $$
begin
  if new.etat_mission = 'livree'
     and (old.etat_mission is null or old.etat_mission <> 'livree')
     and new.etat_facturation is null then
    new.etat_facturation := 'a_facturer';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mex_auto_facturation on public.missions_exceptionnelles;
create trigger trg_mex_auto_facturation
  before update on public.missions_exceptionnelles
  for each row execute function public.auto_facturation_on_livree_mex();

-- Idem sur INSERT : si une row arrive deja en TERMINE / livree, set la facturation
create or replace function public.auto_facturation_on_termine_insert()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name in ('ir_obligations', 'caa_obligations') then
    if new.statut_logique = 'TERMINE' and new.etat_facturation is null then
      new.etat_facturation := 'a_facturer';
    end if;
  elsif tg_table_name = 'obligations' then
    if new.statut_logique = 'TERMINE'
       and new.etat_facturation is null
       and new.type in ('AGO_DEPOT', 'LIASSE_PLAQUETTE') then
      new.etat_facturation := 'a_facturer';
    end if;
  elsif tg_table_name = 'missions_exceptionnelles' then
    if new.etat_mission = 'livree' and new.etat_facturation is null then
      new.etat_facturation := 'a_facturer';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ir_obligations_auto_facturation_insert on public.ir_obligations;
create trigger trg_ir_obligations_auto_facturation_insert
  before insert on public.ir_obligations
  for each row execute function public.auto_facturation_on_termine_insert();

drop trigger if exists trg_caa_obligations_auto_facturation_insert on public.caa_obligations;
create trigger trg_caa_obligations_auto_facturation_insert
  before insert on public.caa_obligations
  for each row execute function public.auto_facturation_on_termine_insert();

drop trigger if exists trg_obligations_auto_facturation_insert on public.obligations;
create trigger trg_obligations_auto_facturation_insert
  before insert on public.obligations
  for each row execute function public.auto_facturation_on_termine_insert();

drop trigger if exists trg_mex_auto_facturation_insert on public.missions_exceptionnelles;
create trigger trg_mex_auto_facturation_insert
  before insert on public.missions_exceptionnelles
  for each row execute function public.auto_facturation_on_termine_insert();
