-- ============================================================================
-- Seed : libellés métier des statuts (status_options)
-- Valeurs extraites de la base Notion réelle (notion/raw/Prospects Clients ...csv).
-- Chaque option mappe un libellé métier vers un statut logique exploitable.
-- ============================================================================

insert into public.status_options (scope, type_code, libelle, statut_logique, ordre) values

-- =========================================================
-- ONBOARDING TASKS
-- =========================================================

-- 2G - Tally Créa / PDC
('onboarding','tally_crea_pdc','A envoyer','A_FAIRE',10),
('onboarding','tally_crea_pdc','Rempli','TERMINE',20),
('onboarding','tally_crea_pdc','N/A','NON_APPLICABLE',90),

-- 2G - Abo MOON
('onboarding','abo_moon','A créer','A_FAIRE',10),
('onboarding','abo_moon','Activé','TERMINE',20),
('onboarding','abo_moon','N/A','NON_APPLICABLE',90),

-- 2G - Mandat MOON
('onboarding','mandat_moon','A envoyer','A_FAIRE',10),
('onboarding','mandat_moon','Actif','TERMINE',20),
('onboarding','mandat_moon','N/A','NON_APPLICABLE',90),

-- 2G - Mandat Impôts
('onboarding','mandat_impots','A initier','A_FAIRE',10),
('onboarding','mandat_impots','OK - Signé > Déposé','TERMINE',20),
('onboarding','mandat_impots','OK - N/A','NON_APPLICABLE',90),

-- 2G - Impot.gouv
('onboarding','impot_gouv','A initier','A_FAIRE',10),
('onboarding','impot_gouv','Délégation demandée','EN_COURS',15),
('onboarding','impot_gouv','OK - Accès valide','TERMINE',20),

-- 2G - CFE 1447
('onboarding','cfe_1447','A initier','A_FAIRE',10),
('onboarding','cfe_1447','OK - Signé > Déposé','TERMINE',20),
('onboarding','cfe_1447','OK - N/A','NON_APPLICABLE',90),

-- 2G - Accès Pennylane
('onboarding','acces_pennylane','A créer','A_FAIRE',10),
('onboarding','acces_pennylane','Accès créé','TERMINE',20),

-- 2G - OB Pennylane
('onboarding','ob_pennylane','Prendre rdv','A_FAIRE',10),
('onboarding','ob_pennylane','Ok - onboarding réalisé','TERMINE',20),
('onboarding','ob_pennylane','N/A','NON_APPLICABLE',90),

-- 2C - Dépôt KBIS Banque
('onboarding','depot_kbis_banque','Prévenir client','A_FAIRE',10),
('onboarding','depot_kbis_banque','Dépôt effectif','TERMINE',20),
('onboarding','depot_kbis_banque','N/A','NON_APPLICABLE',90),

-- 2R - Confrère
('onboarding','confrere','A initier','A_FAIRE',10),
('onboarding','confrere','OK - Validé','TERMINE',20),
('onboarding','confrere','OK - N/A','NON_APPLICABLE',90),

-- 2R - Reprise compta
('onboarding','reprise_compta','OK - Validé','TERMINE',20),
('onboarding','reprise_compta','OK - N/A','NON_APPLICABLE',90),

-- 2T - Affiliation TNS
('onboarding','affiliation_tns','A initier','A_FAIRE',10),
('onboarding','affiliation_tns','OK - Mandat prélèvements','TERMINE',20),
('onboarding','affiliation_tns','OK - N/A','NON_APPLICABLE',90),

-- 2T - Lettre d'option IR/IS
('onboarding','option_ir_is','A initier','A_FAIRE',10),
('onboarding','option_ir_is','OK - Déposée','TERMINE',20),
('onboarding','option_ir_is','OK - N/A','NON_APPLICABLE',90),

-- 2T - Prévi TNS
('onboarding','previ_tns','Prendre rdv','A_FAIRE',10),
('onboarding','previ_tns','Ok - prévi','TERMINE',20),
('onboarding','previ_tns','N/A - Non TNS','NON_APPLICABLE',90),

-- =========================================================
-- OBLIGATIONS
-- =========================================================

-- TVA mensuelle / trimestrielle (mêmes libellés)
('obligation','TVA_MENSUELLE','Pas commencé','A_FAIRE',10),
('obligation','TVA_MENSUELLE','EDI - Terminé','TERMINE',20),
('obligation','TVA_MENSUELLE','Terminé','TERMINE',25),
('obligation','TVA_MENSUELLE','N/A','NON_APPLICABLE',90),
('obligation','TVA_TRIMESTRIELLE','Pas commencé','A_FAIRE',10),
('obligation','TVA_TRIMESTRIELLE','EDI - Terminé','TERMINE',20),
('obligation','TVA_TRIMESTRIELLE','N/A','NON_APPLICABLE',90),

-- TVA annuelle CA12 (rarement utilisée - placeholder)
('obligation','TVA_ANNUELLE_CA12','A traiter','A_FAIRE',10),
('obligation','TVA_ANNUELLE_CA12','EDI - Terminé','TERMINE',20),
('obligation','TVA_ANNUELLE_CA12','N/A','NON_APPLICABLE',90),

-- TVS
('obligation','TVS_MENSUELLE','Pas commencé','A_FAIRE',10),
('obligation','TVS_MENSUELLE','EDI - Terminé','TERMINE',20),
('obligation','TVS_MENSUELLE','N/A','NON_APPLICABLE',90),
('obligation','TVS_TRIMESTRIELLE','Pas commencé','A_FAIRE',10),
('obligation','TVS_TRIMESTRIELLE','N/A','NON_APPLICABLE',90),

-- IS - acomptes
('obligation','IS_ACOMPTE','À traiter','A_FAIRE',10),
('obligation','IS_ACOMPTE','EDI - Terminé','TERMINE',20),
('obligation','IS_ACOMPTE','N/A - Dispense','NON_APPLICABLE',90),

-- IS - solde
('obligation','IS_SOLDE','A traiter','A_FAIRE',10),
('obligation','IS_SOLDE','EDI - Terminé','TERMINE',20),
('obligation','IS_SOLDE','N/A','NON_APPLICABLE',90),

-- CVAE
('obligation','CVAE','A traiter','A_FAIRE',10),
('obligation','CVAE','EDI - Terminé','TERMINE',20),
('obligation','CVAE','N/A','NON_APPLICABLE',90),
('obligation','CVAE_ACOMPTE','-','A_FAIRE',10),
('obligation','CVAE_ACOMPTE','EDI - Terminé','TERMINE',20),
('obligation','CVAE_ACOMPTE','N/A','NON_APPLICABLE',90),

-- CFE - vocabulaire spécifique
('obligation','CFE','A traiter','A_FAIRE',10),
('obligation','CFE','Pas d''avis','EN_COURS',15),
('obligation','CFE','Avis à zero','TERMINE',20),
('obligation','CFE','PRLV échéance','TERMINE',25),
('obligation','CFE','Paiement manuel','TERMINE',30),

-- DAS2 / 2561 / 2777 (mêmes libellés)
('obligation','DAS2','A traiter','A_FAIRE',10),
('obligation','DAS2','EDI - Terminé','TERMINE',20),
('obligation','DAS2','N/A','NON_APPLICABLE',90),
('obligation','DECL_2561','A traiter','A_FAIRE',10),
('obligation','DECL_2561','EDI - Terminé','TERMINE',20),
('obligation','DECL_2561','N/A','NON_APPLICABLE',90),
('obligation','DECL_2777','A traiter','A_FAIRE',10),
('obligation','DECL_2777','EDI - Terminé','TERMINE',20),
('obligation','DECL_2777','N/A','NON_APPLICABLE',90),

-- OSS
('obligation','OSS','Pas commencé','A_FAIRE',10),
('obligation','OSS','Terminé','TERMINE',20),
('obligation','OSS','N/A','NON_APPLICABLE',90),

-- DES
('obligation','DES','A traiter','A_FAIRE',10),
('obligation','DES','EDI - Terminé','TERMINE',20),
('obligation','DES','N/A','NON_APPLICABLE',90),

-- Mission compta - vocabulaire spécifique avec préfixes numériques (Notion)
('obligation','COMPTA','0 - à traiter','A_FAIRE',10),
('obligation','COMPTA','6 - Transmis au client','TERMINE',20),
('obligation','COMPTA','Z - N/A','NON_APPLICABLE',90),

-- Dépôt (des comptes annuels)
('obligation','DEPOT_COMPTES','A traiter','A_FAIRE',10),
('obligation','DEPOT_COMPTES','Débuté','EN_COURS',15),
('obligation','DEPOT_COMPTES','Déposé - en attente validation','EN_COURS',20),
('obligation','DEPOT_COMPTES','Validé','TERMINE',30),
('obligation','DEPOT_COMPTES','N/A','NON_APPLICABLE',90),

-- Liasse / Plaquette
('obligation','LIASSE_PLAQUETTE','A traiter','A_FAIRE',10),
('obligation','LIASSE_PLAQUETTE','EDI - Terminé','TERMINE',20),
('obligation','LIASSE_PLAQUETTE','N/A','NON_APPLICABLE',90),

-- AGO + dépôt
('obligation','AGO_DEPOT','A traiter','A_FAIRE',10),
('obligation','AGO_DEPOT','Validé','TERMINE',20),
('obligation','AGO_DEPOT','N/A','NON_APPLICABLE',90),

-- Facturation Jur
('obligation','FACTURATION_JUR','A facturer','A_FAIRE',10),
('obligation','FACTURATION_JUR','Facturé','TERMINE',20),
('obligation','FACTURATION_JUR','N/A - Pas facturé','NON_APPLICABLE',90),

-- État création (immatriculation)
('obligation','ETAT_CREATION','-','A_FAIRE',10),
('obligation','ETAT_CREATION','Actée KBIS reçu','TERMINE',20)

on conflict (scope, type_code, libelle) do nothing;
