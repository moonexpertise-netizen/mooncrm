-- Suppression de la table tally_responses : on abandonne la réception
-- automatique des formulaires Tally (webhook + inbox de rattachement).
-- L'envoi du Tally par mail au client reste actif (TallyButton -> mailto).
-- Le client renvoie le formulaire rempli en PJ ou sur Pennylane, et on
-- saisit manuellement les infos sur la fiche.

drop table if exists public.tally_responses;
