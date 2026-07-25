-- 0092 : corrige le statut par défaut des obligations TVA/OSS/DES/TVS.
--
-- Bug : "Rejetée - à renvoyer" (statut_logique A_FAIRE) avait été introduite en
-- 0006 avec ordre = 5, donc AVANT "Pas commencé" (ordre 10). Or une obligation
-- fraîchement créée n'a pas de statut_detail : le tracker (et les actions
-- ensureObligationRow / setEcheanceStatus) affichent alors le PREMIER statut
-- A_FAIRE par ordre croissant. Résultat : les nouvelles obligations sortaient
-- "Rejetée - à renvoyer" au lieu de "Pas commencé".
--
-- Correctif : on remonte "Rejetée - à renvoyer" à l'ordre 12 (juste après
-- "Pas commencé" = 10, avant "Préparée" = 15). "Pas commencé" redevient le
-- premier A_FAIRE, donc le défaut correct. Elle reste dans le groupe À faire,
-- en rouge, juste après le point de départ.

update public.status_options
set ordre = 12
where scope = 'obligation'
  and libelle = 'Rejetée - à renvoyer'
  and ordre = 5;
