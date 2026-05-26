/**
 * Constantes partagées du module onboarding (UI + serveur).
 *
 * Ce fichier est volontairement séparé de `actions.ts` parce que ce dernier
 * porte la directive `"use server"`, qui n'autorise que des exports de
 * fonctions async. Toute constante / type / mapping doit vivre ici pour
 * pouvoir être importée à la fois depuis le serveur et depuis les Server
 * Components.
 */

/**
 * Ordre canonique de toutes les task_keys possibles (utilisé pour trier
 * l'affichage côté UI quand on lit en DB sans connaître l'origine).
 */
export const TASK_ORDER: string[] = [
  "tally_crea_pdc",
  "acces_pennylane",
  "depot_kbis_banque",
  "confrere",
  "abo_moon",
  "mandat_moon",
  "impot_gouv",
  "mandat_impots",
  "cfe_1447",
  "ob_pennylane",
  "option_ir_is",
  "previ_tns",
  "affiliation_tns",
];
