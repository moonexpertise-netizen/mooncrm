-- 0089 : Forfait de début d'activité — nombre d'échéances maximum.
--
-- Quand la condition de fin du forfait est "Début de facturation", la lettre
-- de mission doit borner la durée : "... et jusqu'au début de votre
-- facturation (N échéances maximum)". N est choisi via un sélecteur 1..6
-- sur la fiche client. NULL = pas de borne affichée (rétro-compatible).

alter table public.clients
  add column if not exists forfait_debut_nb_echeances integer
    check (forfait_debut_nb_echeances between 1 and 6);

comment on column public.clients.forfait_debut_nb_echeances is
  'Forfait début : nb max d''échéances au tarif réduit quand la condition de fin est "Début de facturation" (1..6, null = non borné). Impact LDM uniquement.';
