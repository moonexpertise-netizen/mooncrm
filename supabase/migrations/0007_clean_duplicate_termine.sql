-- Nettoyage : "Terminé" doublon (TVA_MENSUELLE avait à la fois "EDI - Terminé"
-- et "Terminé" pour le même statut_logique TERMINE). On remappe les
-- obligations existantes vers "EDI - Terminé" puis on supprime le libellé.

update public.obligations
set statut_detail = 'EDI - Terminé'
where type = 'TVA_MENSUELLE'
  and statut_detail = 'Terminé';

delete from public.status_options
where scope = 'obligation'
  and type_code = 'TVA_MENSUELLE'
  and libelle = 'Terminé';
