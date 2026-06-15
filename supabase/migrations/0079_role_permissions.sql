-- ============================================================================
-- Permissions par rôle ÉDITABLES depuis l'app (page /admin/roles).
--
-- Avant : la matrice rôle→permission vivait uniquement dans le code
-- (lib/permissions.ts). Maintenant : une table role_permissions stocke les
-- droits, qu'un admin peut cocher/décocher. Le code garde les MÊMES valeurs
-- comme défauts (fallback si la table est vide / absente).
--
-- Convention : présence d'une ligne (role, permission) = droit ACCORDÉ.
-- Le rôle 'admin' n'est PAS éditable côté UI (superadmin = toujours tout),
-- on le seed quand même par cohérence.
-- ============================================================================

create table if not exists public.role_permissions (
  role text not null check (role in ('admin', 'collaborateur', 'lecture', 'externe')),
  permission text not null,
  primary key (role, permission)
);

alter table public.role_permissions enable row level security;

-- Lecture : tout utilisateur authentifié (l'UI a besoin de connaître ses droits).
drop policy if exists "role_permissions readable" on public.role_permissions;
create policy "role_permissions readable"
  on public.role_permissions for select
  using (auth.uid() is not null);

-- Écriture : uniquement les admins (is_admin synchronisé avec role='admin').
drop policy if exists "role_permissions admin write" on public.role_permissions;
create policy "role_permissions admin write"
  on public.role_permissions for all
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true)
  );

-- Seed = matrice par défaut (miroir de lib/permissions.ts). Idempotent.
insert into public.role_permissions (role, permission) values
  -- admin : tout
  ('admin', 'manage_users'),
  ('admin', 'view_finance'),
  ('admin', 'view_facturation'),
  ('admin', 'view_honoraires'),
  ('admin', 'edit_clients'),
  ('admin', 'edit_honoraires'),
  ('admin', 'edit_production'),
  ('admin', 'edit_facturation'),
  ('admin', 'edit_parametrage'),
  ('admin', 'use_jarvis'),
  -- collaborateur
  ('collaborateur', 'view_facturation'),
  ('collaborateur', 'view_honoraires'),
  ('collaborateur', 'edit_clients'),
  ('collaborateur', 'edit_production'),
  ('collaborateur', 'edit_facturation'),
  ('collaborateur', 'use_jarvis'),
  -- lecture seule
  ('lecture', 'view_facturation'),
  ('lecture', 'view_honoraires')
  -- externe : aucune permission (pas de ligne)
on conflict (role, permission) do nothing;
