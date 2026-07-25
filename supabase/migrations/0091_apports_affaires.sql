-- 0091 : Apports d'affaires à régler.
--
-- Quand un dossier est signé, MOON peut devoir une commission à un apporteur
-- d'affaires. On suit qui, combien, sous quelle forme (facture pro ou carte
-- cadeau perso), et si c'est réglé.
--
-- Modèle relationnel : un dossier a 0..n apports. L'apporteur est un simple
-- texte (avec autocomplétion côté UI) — promouvable en table dédiée plus tard.

create table if not exists public.apports_affaires (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  apporteur text not null,
  montant numeric(10, 2) not null default 0 check (montant >= 0),
  -- 'facture'      : l'apporteur facture MOON (passe en compta pro)
  -- 'carte_cadeau' : carte cadeau perso (hors compta pro)
  mode text not null check (mode in ('facture', 'carte_cadeau')),
  regle boolean not null default false,
  regle_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists idx_apports_client on public.apports_affaires (client_id);
create index if not exists idx_apports_regle on public.apports_affaires (regle);

-- RLS : lecture/écriture aux utilisateurs authentifiés. Le vrai gating
-- (view_finance / edit) est fait côté serveur via requirePermission, comme
-- pour les autres modules (CAA, IR...).
alter table public.apports_affaires enable row level security;
drop policy if exists p_apports_all on public.apports_affaires;
create policy p_apports_all on public.apports_affaires
  for all to authenticated using (true) with check (true);
