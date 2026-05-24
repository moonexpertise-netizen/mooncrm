-- ============================================================================
-- Consolidation TVS_MENSUELLE / TVS_TRIMESTRIELLE -> TVS
-- Doit tourner après 0004 (qui a ajouté la valeur 'TVS' à l'enum).
-- ============================================================================

-- Supprimer les doublons éventuels (si un client avait à la fois TVS_M et TVS_T
-- pour la même année) : on garde la première sub par client/année.
delete from public.obligation_subscriptions s
using public.obligation_subscriptions s2
where s.client_id = s2.client_id
  and s.annee = s2.annee
  and s.type in ('TVS_MENSUELLE', 'TVS_TRIMESTRIELLE')
  and s2.type in ('TVS_MENSUELLE', 'TVS_TRIMESTRIELLE')
  and s.type <> s2.type
  and s.id > s2.id;

-- Renommer les types restants vers TVS
update public.obligation_subscriptions
set type = 'TVS'
where type in ('TVS_MENSUELLE', 'TVS_TRIMESTRIELLE');

update public.obligations
set type = 'TVS'
where type in ('TVS_MENSUELLE', 'TVS_TRIMESTRIELLE');

-- Pour status_options : les libellés sont identiques entre M/T, on supprime
-- les TVS_TRIMESTRIELLE puis on renomme TVS_MENSUELLE -> TVS. On dédoublonne
-- aussi vis-à-vis de libellés "TVS" déjà présents.
delete from public.status_options
where scope = 'obligation' and type_code = 'TVS_TRIMESTRIELLE';

delete from public.status_options s
using public.status_options s2
where s.scope = 'obligation'
  and s2.scope = 'obligation'
  and s.type_code = 'TVS_MENSUELLE'
  and s2.type_code = 'TVS'
  and s.libelle = s2.libelle;

update public.status_options
set type_code = 'TVS'
where scope = 'obligation' and type_code = 'TVS_MENSUELLE';
